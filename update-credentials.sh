#!/bin/bash

# Script to update New Relic credentials in index.html
# Usage: ./update-credentials.sh

if [ ! -f .env ]; then
    echo "Error: .env file not found. Please copy .env.example to .env and fill in your credentials."
    exit 1
fi

# Load environment variables
source .env

# Update index.html with credentials from .env
sed -i.bak \
    -e "s/accountID:\"XXXXXXX\"/accountID:\"$VITE_NR_ACCOUNT_ID\"/g" \
    -e "s/trustKey:\"XXXXXXX\"/trustKey:\"$VITE_NR_TRUST_KEY\"/g" \
    -e "s/agentID:\"XXXXXXXXX\"/agentID:\"$VITE_NR_AGENT_ID\"/g" \
    -e "s/licenseKey:\"NRBR-XXXXXXXXXXXXXXXXXXXX\"/licenseKey:\"$VITE_NR_LICENSE_KEY\"/g" \
    -e "s/applicationID:\"XXXXXXXXX\"/applicationID:\"$VITE_NR_APPLICATION_ID\"/g" \
    index.html

echo "✅ Updated index.html with credentials from .env"
echo "⚠️  Remember: Never commit index.html with real credentials to version control!"
