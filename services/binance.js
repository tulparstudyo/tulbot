const crypto = require('crypto');

class BinanceService {
    constructor() {
        console.log('🔧 Binance API ayarları:');
        console.log('   API Key:', process.env.BINANCE_API_KEY ? 'Mevcut' : 'Eksik');
        console.log('   Secret Key:', process.env.BINANCE_SECRET_KEY ? 'Mevcut' : 'Eksik');
        console.log('   Testnet:', process.env.BINANCE_TESTNET);
        
        this.isTestnet = process.env.BINANCE_TESTNET === 'true';
        this.baseUrl = this.isTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
        this.apiKey = process.env.BINANCE_API_KEY;
        this.secretKey = process.env.BINANCE_SECRET_KEY;
        
        this.symbol = process.env.SYMBOL || 'BTCUSDT';
        this.tradeAmount = parseFloat(process.env.TRADE_AMOUNT) || 10;
    }

    // İmza oluştur
    createSignature(queryString) {
        return crypto.createHmac('sha256', this.secretKey).update(queryString).digest('hex');
    }

    // API çağrısı yap
    async makeRequest(endpoint, params = {}, method = 'GET', signed = false) {
        try {
            let queryString = '';
            
            if (signed) {
                params.timestamp = Date.now();
                params.recvWindow = 10000;
            }
            
            // Query string oluştur
            if (Object.keys(params).length > 0) {
                queryString = Object.keys(params)
                    .map(key => `${key}=${params[key]}`)
                    .join('&');
            }
            
            // İmza ekle
            if (signed) {
                const signature = this.createSignature(queryString);
                queryString += `&signature=${signature}`;
            }
            
            const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (signed) {
                headers['X-MBX-APIKEY'] = this.apiKey;
            }
            
            const response = await fetch(url, {
                method,
                headers
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.msg || `HTTP ${response.status}`);
            }
            
            return data;
            
        } catch (error) {
            console.error(`API çağrısı başarısız (${endpoint}):`, error.message);
            throw error;
        }
    }

    // Hesap bilgilerini al
    async getAccountInfo() {
        try {
            const data = await this.makeRequest('/api/v3/account', {}, 'GET', true);
            console.log('✅ Hesap bilgisi başarıyla alındı');
            return data;
        } catch (error) {
            console.error('❌ Hesap bilgisi alınamadı:', error.message);
            if (error.message.includes('API-key format invalid')) {
                console.error('💡 Çözüm: .env dosyasındaki API anahtarlarını kontrol edin');
                console.error('💡 Testnet için: https://testnet.binance.vision/ adresinden API anahtarı alın');
            }
            throw error;
        }
    }

    // Mevcut fiyatı al
    async getCurrentPrice(symbol = this.symbol) {
        try {
            const data = await this.makeRequest('/api/v3/ticker/price', { symbol });
            return parseFloat(data.price);
        } catch (error) {
            console.error('❌ Fiyat bilgisi alınamadı:', error.message);
            throw error;
        }
    }

    // Kline verilerini al (teknik analiz için)
    async getKlines(symbol = this.symbol, interval = '1m', limit = 100) {
        try {
            const data = await this.makeRequest('/api/v3/klines', {
                symbol,
                interval,
                limit
            });
            
            return data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6]
            }));
        } catch (error) {
            console.error('❌ Kline verileri alınamadı:', error.message);
            throw error;
        }
    }

    // Alım emri ver
    async buyOrder(quantity, price = null) {
        try {
            const params = {
                symbol: this.symbol,
                side: 'BUY',
                type: price ? 'LIMIT' : 'MARKET',
                quantity: quantity.toString()
            };

            if (price) {
                params.price = price.toString();
                params.timeInForce = 'GTC';
            }

            const order = await this.makeRequest('/api/v3/order', params, 'POST', true);
            console.log('✅ Alım emri verildi:', order);
            return order;
        } catch (error) {
            console.error('❌ Alım emri verilemedi:', error.message);
            throw error;
        }
    }

    // Satım emri ver
    async sellOrder(quantity, price = null) {
        try {
            const params = {
                symbol: this.symbol,
                side: 'SELL',
                type: price ? 'LIMIT' : 'MARKET',
                quantity: quantity.toString()
            };

            if (price) {
                params.price = price.toString();
                params.timeInForce = 'GTC';
            }

            const order = await this.makeRequest('/api/v3/order', params, 'POST', true);
            console.log('✅ Satım emri verildi:', order);
            return order;
        } catch (error) {
            console.error('❌ Satım emri verilemedi:', error.message);
            throw error;
        }
    }

    // Açık emirleri al
    async getOpenOrders(symbol = this.symbol) {
        try {
            return await this.makeRequest('/api/v3/openOrders', { symbol }, 'GET', true);
        } catch (error) {
            console.error('❌ Açık emirler alınamadı:', error.message);
            throw error;
        }
    }

    // Bakiye kontrolü
    async getBalance(asset = 'USDT') {
        try {
            const account = await this.getAccountInfo();
            const balance = account.balances.find(b => b.asset === asset);
            return balance ? parseFloat(balance.free) : 0;
        } catch (error) {
            console.error('❌ Bakiye kontrolü yapılamadı:', error.message);
            throw error;
        }
    }
}

module.exports = BinanceService;