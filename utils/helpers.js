const fs = require('fs').promises;
const path = require('path');

class Helpers {
    // Log dosyasına yaz
    static async writeLog(message, type = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${type}] ${message}\n`;
        
        try {
            const logPath = path.join(__dirname, '../logs/trading.log');
            await fs.appendFile(logPath, logMessage);
        } catch (error) {
            console.error('Log yazılamadı:', error.message);
        }
    }

    // Hata logu
    static async logError(error, context = '') {
        const message = context ? `${context}: ${error.message}` : error.message;
        await this.writeLog(message, 'ERROR');
        console.error(`[ERROR] ${message}`);
    }

    // Bilgi logu
    static async logInfo(message) {
        await this.writeLog(message, 'INFO');
        console.log(`[INFO] ${message}`);
    }

    // Uyarı logu
    static async logWarning(message) {
        await this.writeLog(message, 'WARNING');
        console.warn(`[WARNING] ${message}`);
    }

    // İşlem logu
    static async logTrade(action, symbol, price, quantity, score) {
        const message = `${action} - ${symbol} - Fiyat: $${price} - Miktar: ${quantity} - Puan: ${score}/10`;
        await this.writeLog(message, 'TRADE');
        console.log(`[TRADE] ${message}`);
    }

    // Sayıyı formatla
    static formatNumber(number, decimals = 2) {
        return parseFloat(number.toFixed(decimals));
    }

    // Yüzde hesapla
    static calculatePercentage(current, previous) {
        if (previous === 0) return 0;
        return ((current - previous) / previous) * 100;
    }

    // Miktar hesapla (USDT cinsinden)
    static calculateQuantity(usdtAmount, price) {
        return this.formatNumber(usdtAmount / price, 6);
    }

    // Fiyat formatla
    static formatPrice(price) {
        if (price >= 1) {
            return this.formatNumber(price, 2);
        } else if (price >= 0.01) {
            return this.formatNumber(price, 4);
        } else {
            return this.formatNumber(price, 8);
        }
    }

    // Zaman formatla
    static formatTime(date = new Date()) {
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Gecikme (delay)
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry mekanizması
    static async retry(fn, maxRetries = 3, delayMs = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                
                await this.logWarning(`Deneme ${i + 1}/${maxRetries} başarısız: ${error.message}`);
                await this.delay(delayMs * (i + 1)); // Exponential backoff
            }
        }
    }

    // Güvenli JSON parse
    static safeJsonParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (error) {
            return defaultValue;
        }
    }

    // Dosya var mı kontrol et
    static async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    // Dizin oluştur
    static async ensureDir(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    // Trades dosyasına işlem kaydet
    static async saveTrade(trade) {
        try {
            const tradesPath = path.join(__dirname, '../data/trades.json');
            
            // Mevcut trades'leri oku
            let trades = [];
            if (await this.fileExists(tradesPath)) {
                const tradesData = await fs.readFile(tradesPath, 'utf8');
                trades = this.safeJsonParse(tradesData, []);
            }
            
            // Yeni trade ekle
            trades.push({
                ...trade,
                id: Date.now(),
                timestamp: new Date().toISOString()
            });
            
            // Son 100 işlemi tut
            if (trades.length > 100) {
                trades = trades.slice(-100);
            }
            
            // Dosyaya kaydet
            await this.ensureDir(path.dirname(tradesPath));
            await fs.writeFile(tradesPath, JSON.stringify(trades, null, 2));
            
            await this.logInfo(`İşlem kaydedildi: ${trade.action} ${trade.symbol} ${trade.quantity}`);
            
        } catch (error) {
            await this.logError(error, 'Trade kaydetme');
        }
    }

    // Trades dosyasından işlemleri oku
    static async loadTrades(limit = 50) {
        try {
            const tradesPath = path.join(__dirname, '../data/trades.json');
            
            if (!(await this.fileExists(tradesPath))) {
                return [];
            }
            
            const tradesData = await fs.readFile(tradesPath, 'utf8');
            const trades = this.safeJsonParse(tradesData, []);
            
            return trades.slice(-limit).reverse(); // Son N işlemi ters sırada
            
        } catch (error) {
            await this.logError(error, 'Trade okuma');
            return [];
        }
    }

    // Günlük istatistikleri hesapla
    static calculateDailyStats(trades) {
        const today = new Date().toDateString();
        const todayTrades = trades.filter(trade => 
            new Date(trade.timestamp).toDateString() === today
        );

        const buyTrades = todayTrades.filter(t => t.action === 'BUY').length;
        const sellTrades = todayTrades.filter(t => t.action === 'SELL').length;
        
        let totalProfit = 0;
        for (let i = 0; i < todayTrades.length - 1; i += 2) {
            const buyTrade = todayTrades[i];
            const sellTrade = todayTrades[i + 1];
            
            if (buyTrade && sellTrade && buyTrade.action === 'BUY' && sellTrade.action === 'SELL') {
                const profit = this.calculatePercentage(sellTrade.price, buyTrade.price);
                totalProfit += profit;
            }
        }

        return {
            totalTrades: todayTrades.length,
            buyTrades,
            sellTrades,
            totalProfit: this.formatNumber(totalProfit)
        };
    }

    // Risk kontrolü
    static checkRiskLimits(currentTrades, maxDailyTrades) {
        const today = new Date().toDateString();
        const todayTrades = currentTrades.filter(trade => 
            new Date(trade.timestamp).toDateString() === today
        );

        return {
            canTrade: todayTrades.length < maxDailyTrades,
            tradesLeft: Math.max(0, maxDailyTrades - todayTrades.length),
            todayTradeCount: todayTrades.length
        };
    }
}

module.exports = Helpers;