const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const Helpers = require('../utils/helpers');

class Routes {
    constructor(tradingBot) {
        this.router = express.Router();
        this.tradingBot = tradingBot;
        this.setupRoutes();
    }

    setupRoutes() {
        // Ana sayfa - Bot raporu
        this.router.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../web/index.html'));
        });

        // CSS dosyası
        this.router.get('/style.css', (req, res) => {
            res.sendFile(path.join(__dirname, '../web/style.css'));
        });

        // JavaScript dosyası
        this.router.get('/script.js', (req, res) => {
            res.sendFile(path.join(__dirname, '../web/script.js'));
        });

        // Bot durumu API
        this.router.get('/api/status', (req, res) => {
            try {
                const status = {
                    isRunning: this.tradingBot.isRunning,
                    symbol: this.tradingBot.symbol,
                    lastUpdate: this.tradingBot.lastUpdate,
                    currentPrice: this.tradingBot.currentPrice,
                    lastAnalysis: this.tradingBot.lastAnalysis,
                    lastScore: this.tradingBot.lastScore,
                    allowBuyOrders: this.tradingBot.allowBuyOrders,
                    allowSellOrders: this.tradingBot.allowSellOrders,
                    uptime: this.tradingBot.startTime ? 
                        Date.now() - this.tradingBot.startTime : 0
                };
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Son işlemler API (dosyadan oku)
        this.router.get('/api/trades', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const trades = await Helpers.loadTrades(limit);
                res.json(trades);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Günlük istatistikler API
        this.router.get('/api/stats', (req, res) => {
            try {
                const stats = Helpers.calculateDailyStats(this.tradingBot.tradeHistory);
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Log dosyası API
        this.router.get('/api/logs', async (req, res) => {
            try {
                const logPath = path.join(__dirname, '../logs/trading.log');
                const logExists = await Helpers.fileExists(logPath);
                
                if (!logExists) {
                    return res.json({ logs: [] });
                }

                const logContent = await fs.readFile(logPath, 'utf8');
                const logs = logContent.split('\n')
                    .filter(line => line.trim())
                    .slice(-100) // Son 100 log
                    .map(line => {
                        const match = line.match(/\[(.*?)\] \[(.*?)\] (.*)/);
                        if (match) {
                            return {
                                timestamp: match[1],
                                type: match[2],
                                message: match[3]
                            };
                        }
                        return { timestamp: '', type: 'INFO', message: line };
                    });

                res.json({ logs });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Bot başlat/durdur API
        this.router.post('/api/control', async (req, res) => {
            try {
                const { action } = req.body;
                
                if (action === 'start') {
                    if (!this.tradingBot.isRunning) {
                        await this.tradingBot.start();
                        res.json({ success: true, message: 'Bot başlatıldı' });
                    } else {
                        res.json({ success: false, message: 'Bot zaten çalışıyor' });
                    }
                } else if (action === 'stop') {
                    if (this.tradingBot.isRunning) {
                        await this.tradingBot.stop();
                        res.json({ success: true, message: 'Bot durduruldu' });
                    } else {
                        res.json({ success: false, message: 'Bot zaten durmuş' });
                    }
                } else {
                    res.status(400).json({ error: 'Geçersiz aksiyon' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Manuel analiz API
        this.router.post('/api/analyze', async (req, res) => {
            try {
                const analysis = await this.tradingBot.performAnalysis();
                res.json(analysis);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Hesap bilgileri API
        this.router.get('/api/account', async (req, res) => {
            try {
                const accountInfo = await this.tradingBot.binanceService.getAccountInfo();
                const quoteBalance = await this.tradingBot.binanceService.getBalance(this.tradingBot.quoteAsset);
                const baseBalance = await this.tradingBot.binanceService.getBalance(this.tradingBot.baseAsset);
                
                res.json({
                    quoteBalance,
                    baseBalance,
                    quoteAsset: this.tradingBot.quoteAsset,
                    baseAsset: this.tradingBot.baseAsset,
                    totalAssets: accountInfo.totalWalletBalance || 0
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Açık emirler API
        this.router.get('/api/orders', async (req, res) => {
            try {
                const openOrders = await this.tradingBot.binanceService.getOpenOrders();
                res.json(openOrders);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Test bildirimi API
        this.router.post('/api/test-notification', async (req, res) => {
            try {
                await this.tradingBot.telegramService.sendMessage('🧪 Test bildirimi - Bot çalışıyor!');
                res.json({ success: true, message: 'Test bildirimi gönderildi' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    getRouter() {
        return this.router;
    }
}

module.exports = Routes;