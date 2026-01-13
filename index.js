require('dotenv').config();
const express = require('express');
const BinanceService = require('./services/binance');
const TelegramService = require('./services/telegram');
const TechnicalAnalysis = require('./services/technical');
const ScoringSystem = require('./utils/scoring');
const Helpers = require('./utils/helpers');
const Routes = require('./routes/routes');

class CryptoTradingBot {
    constructor() {
        this.binanceService = new BinanceService();
        this.telegramService = new TelegramService();
        this.technicalAnalysis = new TechnicalAnalysis();
        this.scoringSystem = new ScoringSystem();
        
        this.symbol = process.env.SYMBOL || 'BTCUSDT';
        this.tradeAmount = parseFloat(process.env.TRADE_AMOUNT) || 10;
        this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 30000;
        this.maxDailyTrades = parseInt(process.env.MAX_DAILY_TRADES) || 10;
        
        // Asset bilgileri
        this.baseAsset = process.env.BASE_ASSET || 'BTC';
        this.quoteAsset = process.env.QUOTE_ASSET || 'USDT';
        
        console.log('💰 Asset Bilgileri:');
        console.log(`   Base Asset: ${this.baseAsset}`);
        console.log(`   Quote Asset: ${this.quoteAsset}`);
        console.log(`   Trading Pair: ${this.symbol}`);
        
        // Trading izinleri
        this.allowBuyOrders = process.env.ALLOW_BUY_ORDERS === 'true';
        this.allowSellOrders = process.env.ALLOW_SELL_ORDERS === 'true';
        
        console.log('🔐 Trading İzinleri:');
        console.log(`   Alım İzni: ${this.allowBuyOrders ? '✅ Aktif' : '❌ Kapalı'}`);
        console.log(`   Satım İzni: ${this.allowSellOrders ? '✅ Aktif' : '❌ Kapalı'}`);
        
        this.isRunning = false;
        this.intervalId = null;
        this.startTime = null;
        this.lastUpdate = null;
        this.currentPrice = null;
        this.lastAnalysis = null;
        this.lastScore = null;
        this.tradeHistory = [];
        
        this.setupWebServer();
        this.setupGracefulShutdown();
    }

    setupWebServer() {
        this.app = express();
        this.app.use(express.json());
        
        // Routes'u bağla
        const routes = new Routes(this);
        this.app.use('/', routes.getRouter());
        
        const port = process.env.PORT || 3000;
        this.server = this.app.listen(port, () => {
            console.log(`🌐 Web sunucusu http://localhost:${port} adresinde çalışıyor`);
            Helpers.logInfo(`Web sunucusu port ${port}'da başlatıldı`);
        });
    }

    async start() {
        if (this.isRunning) {
            console.log('Bot zaten çalışıyor!');
            return;
        }

        try {
            console.log('🚀 Crypto Trading Bot başlatılıyor...');
            await Helpers.logInfo('Bot başlatılıyor');

            // API bağlantısını test et
            await this.testConnections();
            
            this.isRunning = true;
            this.startTime = Date.now();
            
            // Ana döngüyü başlat
            this.intervalId = setInterval(() => {
                this.mainLoop().catch(error => {
                    Helpers.logError(error, 'Ana döngü hatası');
                });
            }, this.checkInterval);

            // İlk analizi hemen yap
            await this.mainLoop();
            
            // Telegram bildirimi gönder
            await this.telegramService.sendStartAlert();
            
            console.log('✅ Bot başarıyla başlatıldı!');
            await Helpers.logInfo('Bot başarıyla başlatıldı');
            
        } catch (error) {
            console.error('❌ Bot başlatılamadı:', error.message);
            await Helpers.logError(error, 'Bot başlatma hatası');
            await this.telegramService.sendErrorAlert(error.message, 'Bot başlatma');
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            console.log('Bot zaten durmuş!');
            return;
        }

        try {
            console.log('🛑 Bot durduruluyor...');
            await Helpers.logInfo('Bot durduruluyor');
            
            this.isRunning = false;
            
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            
            // Telegram bildirimi gönder
            await this.telegramService.sendStopAlert();
            
            console.log('✅ Bot başarıyla durduruldu!');
            await Helpers.logInfo('Bot başarıyla durduruldu');
            
        } catch (error) {
            console.error('❌ Bot durdurulurken hata:', error.message);
            await Helpers.logError(error, 'Bot durdurma hatası');
        }
    }

    async testConnections() {
        console.log('🔍 API bağlantıları test ediliyor...');
        
        try {
            // Binance bağlantısını test et
            const accountInfo = await this.binanceService.getAccountInfo();
            console.log('✅ Binance API bağlantısı başarılı');
            
            // Mevcut fiyatı al
            this.currentPrice = await this.binanceService.getCurrentPrice();
            console.log(`💰 ${this.symbol} mevcut fiyat: $${this.currentPrice}`);
            
            // Telegram bağlantısını test et (opsiyonel)
            if (this.telegramService.enabled) {
                await this.telegramService.sendMessage('🧪 Bot bağlantı testi başarılı!');
                console.log('✅ Telegram bağlantısı başarılı');
            }
            
        } catch (error) {
            throw new Error(`API bağlantı testi başarısız: ${error.message}`);
        }
    }

    async mainLoop() {
        try {
            console.log(`🔄 Analiz yapılıyor... (${new Date().toLocaleString('tr-TR')})`);
            
            // Risk kontrolü
            const riskCheck = Helpers.checkRiskLimits(this.tradeHistory, this.maxDailyTrades);
            if (!riskCheck.canTrade) {
                console.log(`⚠️ Günlük işlem limiti aşıldı (${riskCheck.todayTradeCount}/${this.maxDailyTrades})`);
                return;
            }

            // Teknik analiz yap
            const analysis = await this.performAnalysis();
            
            // Puanlama yap
            const scoreData = this.scoringSystem.getDetailedScore(analysis);
            this.lastScore = scoreData;
            
            console.log(`📊 Analiz Sonuçları:`);
            console.log(`   RSI: ${analysis.rsi.toFixed(2)}`);
            console.log(`   Fisher: ${analysis.fisher.toFixed(2)}`);
            console.log(`   Volume: ${analysis.volumeScore.toFixed(2)}`);
            console.log(`   Alım Puanı: ${scoreData.buy.total.toFixed(2)}/10`);
            console.log(`   Satım Puanı: ${scoreData.sell.total.toFixed(2)}/10`);
            console.log(`   Öneri: ${scoreData.recommendation.action}`);

            // İşlem kararı ver
            await this.makeTradeDecision(scoreData, analysis);
            
            this.lastUpdate = new Date();
            
        } catch (error) {
            console.error('❌ Ana döngü hatası:', error.message);
            await Helpers.logError(error, 'Ana döngü');
            await this.telegramService.sendErrorAlert(error.message, 'Ana döngü');
        }
    }

    async performAnalysis() {
        // Kline verilerini al (1 saatlik) - Daha fazla veri noktası
        const klineData = await this.binanceService.getKlines(this.symbol, '1h', 200);
        
        // Mevcut fiyatı güncelle
        this.currentPrice = klineData[klineData.length - 1].close;
        
        console.log(`📊 Analiz verileri:`);
        console.log(`   Sembol: ${this.symbol}`);
        console.log(`   Veri sayısı: ${klineData.length}`);
        console.log(`   Son fiyat: $${this.currentPrice}`);
        console.log(`   Zaman aralığı: ${new Date(klineData[0].openTime).toLocaleString('tr-TR')} - ${new Date(klineData[klineData.length - 1].closeTime).toLocaleString('tr-TR')}`);
        
        // Teknik analiz yap
        const analysis = this.technicalAnalysis.analyze(klineData);
        this.lastAnalysis = analysis;
        
        return analysis;
    }

    async makeTradeDecision(scoreData, analysis) {
        const recommendation = scoreData.recommendation;
        const minScore = 7; // Minimum işlem puanı
        
        if (recommendation.score < minScore) {
            console.log(`📊 Puan yetersiz (${recommendation.score.toFixed(2)}/${minScore}), işlem yapılmıyor`);
            return;
        }

        try {
            if (recommendation.action === 'BUY' && this.allowBuyOrders) {
                await this.executeBuyOrder(scoreData, analysis);
            } else if (recommendation.action === 'SELL' && this.allowSellOrders) {
                await this.executeSellOrder(scoreData, analysis);
            } else if (recommendation.action === 'BUY' && !this.allowBuyOrders) {
                console.log('🚫 ALIM sinyali tespit edildi ancak alım izni kapalı');
                await Helpers.logInfo('Alım sinyali - İzin kapalı');
            } else if (recommendation.action === 'SELL' && !this.allowSellOrders) {
                console.log('🚫 SATIM sinyali tespit edildi ancak satım izni kapalı');
                await Helpers.logInfo('Satım sinyali - İzin kapalı');
            }
        } catch (error) {
            console.error('❌ İşlem hatası:', error.message);
            await Helpers.logError(error, 'İşlem yapma');
            await this.telegramService.sendErrorAlert(error.message, 'İşlem yapma');
        }
    }

    async executeBuyOrder(scoreData, analysis) {
        console.log('🟢 ALIM sinyali tespit edildi!');
        
        // Bakiye kontrolü
        const usdtBalance = await this.binanceService.getBalance(this.quoteAsset);
        if (usdtBalance < this.tradeAmount) {
            console.log(`⚠️ Yetersiz ${this.quoteAsset} bakiye: ${usdtBalance}`);
            return;
        }

        // Miktar hesapla
        const quantity = Helpers.calculateQuantity(this.tradeAmount, this.currentPrice);
        
        // Alım emri ver
        //const order = await this.binanceService.buyOrder(quantity);
        
        // İşlemi kaydet
        const trade = {
            action: 'BUY',
            symbol: this.symbol,
            price: this.currentPrice,
            quantity: quantity,
            score: scoreData.buy.total,
            orderId: 0//order.orderId
        };
        
        this.tradeHistory.push(trade);
        
        // Dosyaya kaydet
        await Helpers.saveTrade(trade);
        
        // Log ve bildirim
        await Helpers.logTrade('ALIM', this.symbol, this.currentPrice, quantity, scoreData.buy.total);
        await this.telegramService.sendBuyAlert(
            this.symbol, 
            this.currentPrice, 
            quantity, 
            scoreData.buy.total
        );
        
        console.log(`✅ Alım emri başarılı: ${quantity} ${this.symbol} @ $${this.currentPrice}`);
    }

    async executeSellOrder(scoreData, analysis) {
        console.log('🔴 SATIM sinyali tespit edildi!');
        
        // Base asset bakiye kontrolü
        const baseBalance = await this.binanceService.getBalance(this.baseAsset);
        
        if (baseBalance < 0.001) { // Minimum işlem miktarı
            console.log(`⚠️ Yetersiz ${this.baseAsset} bakiye: ${baseBalance}`);
            return;
        }

        // Satılacak miktarı hesapla
        const quantity = Helpers.formatNumber(baseBalance * 0.95, 6); // %95'ini sat (komisyon için)
        
        // Satım emri ver
        //const order = await this.binanceService.sellOrder(quantity);
        
        // Kar/zarar hesapla (basit)
        const lastBuyTrade = this.tradeHistory
            .filter(t => t.action === 'BUY')
            .pop();
        
        let profit = null;
        if (lastBuyTrade) {
            profit = Helpers.calculatePercentage(this.currentPrice, lastBuyTrade.price);
        }
        
        // İşlemi kaydet
        const trade = {
            action: 'SELL',
            symbol: this.symbol,
            price: this.currentPrice,
            quantity: quantity,
            score: scoreData.sell.total,
            profit: profit,
            orderId: 0//order.orderId
        };
        
        this.tradeHistory.push(trade);
        
        // Dosyaya kaydet
        await Helpers.saveTrade(trade);
        
        // Log ve bildirim
        await Helpers.logTrade('SATIM', this.symbol, this.currentPrice, quantity, scoreData.sell.total);
        await this.telegramService.sendSellAlert(
            this.symbol, 
            this.currentPrice, 
            quantity, 
            scoreData.sell.total,
            profit
        );
        
        console.log(`✅ Satım emri başarılı: ${quantity} ${this.symbol} @ $${this.currentPrice}`);
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n${signal} sinyali alındı, bot kapatılıyor...`);
            await this.stop();
            
            if (this.server) {
                this.server.close(() => {
                    console.log('Web sunucusu kapatıldı');
                    process.exit(0);
                });
            } else {
                process.exit(0);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

// Bot'u başlat
async function main() {
    try {
        console.log('🚀 Crypto Trading Bot v1.0 - Geliştirme Modu');
        console.log('================================');
        
        const bot = new CryptoTradingBot();
        
        // Otomatik başlatma (opsiyonel)
        if (process.env.AUTO_START === 'true') {
            await bot.start();
        } else {
            console.log('💡 Bot hazır. Web arayüzünden başlatabilirsiniz: http://localhost:' + (process.env.PORT || 3000));
        }
        
    } catch (error) {
        console.error('❌ Bot başlatılamadı:', error.message);
        process.exit(1);
    }
}

// Yakalanmamış hataları yakala
process.on('unhandledRejection', (reason, promise) => {
    console.error('Yakalanmamış Promise reddi:', reason);
    Helpers.logError(new Error(reason), 'Yakalanmamış Promise reddi');
});

process.on('uncaughtException', (error) => {
    console.error('Yakalanmamış hata:', error);
    Helpers.logError(error, 'Yakalanmamış hata');
    process.exit(1);
});

main();