const { ethers } = require('ethers');
const fs = require('fs').promises;
const readline = require('readline');
const https = require('https');
const axios = require('axios');

const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    bold: '\x1b[1m',
};

const logger = {
    info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
    wallet: (msg) => console.log(`${colors.yellow}[➤] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
    banner: () => {
        console.log(`${colors.cyan}${colors.bold}`);
        console.log(`---------------------------------------------`);
        console.log(`  BNavy Auto Submit - Airdrop Insiders `);
        console.log(`---------------------------------------------${colors.reset}\n`);
    },
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const BYPASS_SSL = true;
const REQUEST_DELAY = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}

function createAgent() {
    return new https.Agent({
        rejectUnauthorized: !BYPASS_SSL
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function submitWallet(walletAddress) {
    const agent = createAgent();

    const headers = {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.5",
        "cache-control": "max-age=0",
        "content-type": "application/x-www-form-urlencoded",
        "sec-ch-ua": "\"Chromium\";v=\"136\", \"Brave\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "sec-gpc": "1",
        "upgrade-insecure-requests": "1",
        cookie: "__test=4ca31d71e43532c2c286891b19e26114",
        Referer: "https://bnavy.ct.ws/registernew.html?i=1",
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            logger.loading(`Submitting wallet ${walletAddress} to Register.php (Attempt ${attempt}/${MAX_RETRIES})`);

            const registerResponse = await axios.post(
                "https://bnavy.ct.ws/Register.php",
                `wallet=${encodeURIComponent(walletAddress)}`,
                {
                    headers,
                    httpsAgent: agent,
                    timeout: 20000 
                }
            );

            if (registerResponse.status !== 200) {
                logger.error(`Failed to register wallet ${walletAddress}: ${registerResponse.status} ${registerResponse.statusText}`);
                if (attempt < MAX_RETRIES) {
                    logger.loading(`Retrying after ${RETRY_DELAY}ms...`);
                    await delay(RETRY_DELAY * attempt); 
                    continue;
                }
                return false;
            }

            logger.loading(`Accessing dashboard for wallet ${walletAddress}`);
            const dashboardResponse = await axios.get(
                `https://bnavy.ct.ws/dashboard.php?wallet=${encodeURIComponent(walletAddress)}`,
                {
                    headers,
                    httpsAgent: agent,
                    timeout: 10000
                }
            );

            if (dashboardResponse.status === 200) {
                logger.success(`Successfully submitted wallet ${walletAddress}`);
                return true;
            } else {
                logger.error(`Failed to access dashboard for wallet ${walletAddress}: ${dashboardResponse.status} ${dashboardResponse.statusText}`);
                if (attempt < MAX_RETRIES) {
                    logger.loading(`Retrying after ${RETRY_DELAY}ms...`);
                    await delay(RETRY_DELAY * attempt);
                    continue;
                }
                return false;
            }
        } catch (error) {
            const errorMessage = error.response
                ? `${error.response.status} ${error.response.statusText}: ${JSON.stringify(error.response.data)}`
                : error.message;
            logger.error(`Error submitting wallet ${walletAddress}: ${errorMessage}`);
            if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.message.includes('SSL')) {
                logger.warn(`SSL certificate verification failed. SSL bypass is ${BYPASS_SSL ? 'enabled' : 'disabled'}.`);
            }
            if (attempt < MAX_RETRIES) {
                logger.loading(`Retrying after ${RETRY_DELAY}ms...`);
                await delay(RETRY_DELAY * attempt);
                continue;
            }
            return false;
        }
    }
    return false;
}

async function saveWallet(wallet) {
    try {
        let wallets = [];
        try {
            const data = await fs.readFile('wallets.json', 'utf8');
            wallets = JSON.parse(data);
        } catch (error) {
        }

        wallets.push(wallet);
        await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
        logger.info(`Saved wallet ${wallet.address} to wallets.json`);
    } catch (error) {
        logger.error(`Failed to save wallet ${wallet.address}: ${error.message}`);
    }
}

async function main() {
    logger.banner();

    if (BYPASS_SSL) {
    }

    rl.question('Enter the number of wallets to generate and submit: ', async (answer) => {
        const count = parseInt(answer);
        if (isNaN(count) || count <= 0) {
            logger.error('Please enter a valid number');
            rl.close();
            return;
        }

        logger.info(`Generating and submitting ${count} wallets`);

        for (let i = 0; i < count; i++) {
            logger.step(`Processing wallet ${i + 1}/${count}`);

            const wallet = generateWallet();
            logger.wallet(`Generated wallet: ${wallet.address}`);

            const success = await submitWallet(wallet.address);
            if (success) {
                await saveWallet({
                    address: wallet.address,
                    privateKey: wallet.privateKey,
                    timestamp: new Date().toISOString()
                });
            }

            if (i < count - 1) {
                logger.loading(`Waiting ${REQUEST_DELAY}ms before next submission`);
                await delay(REQUEST_DELAY);
            }
        }

        logger.success('All wallets processed');
        rl.close();
    });
}

main().catch((error) => {
    logger.error(`Unexpected error: ${error.message}`);
    rl.close();
});