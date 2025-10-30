/**
 * Configuration file for video-tizen-js demo
 * 
 * IMPORTANT: Replace these values with your actual New Relic credentials
 * Get your credentials from: https://one.newrelic.com/launcher/nr1-core.settings
 */

export const config = {
    // Video content settings
    contentId: 'demo-video-001',
    title: 'Big Buck Bunny Demo',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    
    // Alternative HLS stream (for Tizen devices that support it)
    // videoUrl: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',

    // New Relic configuration
    // DO NOT commit real credentials to version control
    // Use environment variables or a separate config file
    newRelicKey: process.env.VITE_NR_LICENSE_KEY || 'YOUR_NEW_RELIC_LICENSE_KEY',
    newRelicAccountId: process.env.VITE_NR_ACCOUNT_ID || 'YOUR_ACCOUNT_ID',
    
    // Tracker settings
    enableBatching: false, // Set to true to batch events before sending
    batchSize: 10,
    batchTimeout: 5000, // ms
    heartbeatInterval: 10000, // Send heartbeat every 10 seconds
    
    // Logging
    enableLogging: true
};

export default config;
