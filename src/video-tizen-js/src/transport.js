/**
 * transport.js
 * Handles sending telemetry data to New Relic or custom endpoints
 * Features: non-blocking fetch, retry logic, batching support
 */

export class Transport {
    constructor(config = {}) {
        this.config = {
            newRelicKey: config.newRelicKey || '',
            newRelicAccountId: config.newRelicAccountId || '',
            customEndpoint: config.customEndpoint || null,
            enableBatching: config.enableBatching || false,
            batchSize: config.batchSize || 10,
            batchTimeout: config.batchTimeout || 5000, // ms
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000, // ms
            enableLogging: config.enableLogging !== false, // default true
            ...config
        };

        this.eventQueue = [];
        this.batchTimer = null;
        this.requestsInFlight = 0;

        // Determine endpoint
        this.endpoint = this._determineEndpoint();
    }

    /**
     * Determine the appropriate endpoint for sending events
     */
    _determineEndpoint() {
        // Use custom endpoint if provided
        if (this.config.customEndpoint) {
            return this.config.customEndpoint;
        }

        // Check if New Relic Browser Agent is available
        if (typeof window !== 'undefined' && window.newrelic) {
            return 'newrelic-browser-agent';
        }

        // Fallback to New Relic Insights API
        if (this.config.newRelicKey && this.config.newRelicAccountId) {
            return `https://insights-collector.newrelic.com/v1/accounts/${this.config.newRelicAccountId}/events`;
        }

        return null;
    }

    /**
     * Send a single event
     * @param {Object} event - The event to send
     * @returns {Promise<boolean>} Success status
     */
    async send(event) {
        if (!event) {
            this._log('warn', 'Attempted to send null/undefined event');
            return false;
        }

        // Add to batch queue if batching is enabled
        if (this.config.enableBatching) {
            return this._addToBatch(event);
        }

        // Send immediately
        return this._sendEvent(event);
    }

    /**
     * Send multiple events in bulk
     * @param {Array} events - Array of events to send
     * @returns {Promise<boolean>} Success status
     */
    async sendBatch(events) {
        if (!events || !events.length) {
            return false;
        }

        if (this.endpoint === 'newrelic-browser-agent') {
            // Send each event individually to Browser Agent
            const results = await Promise.all(
                events.map(event => this._sendToNewRelicAgent(event))
            );
            return results.every(r => r);
        }

        // Send as batch to custom endpoint or Insights API
        return this._sendWithRetry(events, this.config.retryAttempts);
    }

    /**
     * Add event to batch queue
     */
    _addToBatch(event) {
        this.eventQueue.push(event);

        // Flush if batch size reached
        if (this.eventQueue.length >= this.config.batchSize) {
            return this.flush();
        }

        // Set timer for automatic flush
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flush();
            }, this.config.batchTimeout);
        }

        return Promise.resolve(true);
    }

    /**
     * Flush the batch queue immediately
     */
    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.eventQueue.length === 0) {
            return true;
        }

        const eventsToSend = [...this.eventQueue];
        this.eventQueue = [];

        return this.sendBatch(eventsToSend);
    }

    /**
     * Send a single event (no batching)
     */
    async _sendEvent(event) {
        if (!this.endpoint) {
            this._log('warn', 'No endpoint configured. Event not sent:', event);
            return false;
        }

        if (this.endpoint === 'newrelic-browser-agent') {
            return this._sendToNewRelicAgent(event);
        }

        return this._sendWithRetry([event], this.config.retryAttempts);
    }

    /**
     * Send event to New Relic Browser Agent
     */
    _sendToNewRelicAgent(event) {
        try {
            if (typeof window === 'undefined' || !window.newrelic) {
                this._log('warn', 'New Relic Browser Agent not available');
                return Promise.resolve(false);
            }

            // Use New Relic's addPageAction API
            window.newrelic.addPageAction('VideoAction', event);
            this._log('info', 'Event sent to New Relic Browser Agent:', event.actionName);
            return Promise.resolve(true);
        } catch (error) {
            this._log('error', 'Failed to send to New Relic Browser Agent:', error);
            return Promise.resolve(false);
        }
    }

    /**
     * Send events with retry logic
     */
    async _sendWithRetry(events, attemptsLeft) {
        this.requestsInFlight++;

        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.config.newRelicKey || '',
                },
                body: JSON.stringify(events),
                keepalive: true // Ensures request completes even if page unloads
            });

            this.requestsInFlight--;

            if (response.ok) {
                this._log('info', `Successfully sent ${events.length} event(s)`);
                return true;
            }

            // Retry on failure
            if (attemptsLeft > 0) {
                this._log('warn', `Request failed (${response.status}). Retrying... (${attemptsLeft} attempts left)`);
                await this._delay(this.config.retryDelay);
                return this._sendWithRetry(events, attemptsLeft - 1);
            }

            this._log('error', `Failed to send events after all retries. Status: ${response.status}`);
            return false;

        } catch (error) {
            this.requestsInFlight--;

            // Retry on network error
            if (attemptsLeft > 0) {
                this._log('warn', `Network error. Retrying... (${attemptsLeft} attempts left)`, error);
                await this._delay(this.config.retryDelay);
                return this._sendWithRetry(events, attemptsLeft - 1);
            }

            this._log('error', 'Failed to send events:', error);
            return false;
        }
    }

    /**
     * Delay helper for retry logic
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Logging helper
     */
    _log(level, ...args) {
        if (!this.config.enableLogging) return;

        const prefix = '[video-tizen-js/transport]';
        
        switch (level) {
            case 'info':
                console.info(prefix, ...args);
                break;
            case 'warn':
                console.warn(prefix, ...args);
                break;
            case 'error':
                console.error(prefix, ...args);
                break;
            default:
                console.log(prefix, ...args);
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            endpoint: this.endpoint,
            queueSize: this.eventQueue.length,
            requestsInFlight: this.requestsInFlight,
            batchingEnabled: this.config.enableBatching
        };
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Attempt to flush remaining events
        if (this.eventQueue.length > 0) {
            this.flush();
        }
    }
}

export default Transport;
