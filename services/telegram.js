const TelegramBot = require('node-telegram-bot-api');

class TelegramService {
    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!this.token || !this.chatId) {
            console.warn('Telegram bot token veya chat ID bulunamadı. Bildirimler devre dışı.');
            this.enabled = false;
            return;
        }
        
        this.bot = new TelegramBot(this.token, { polling: false });
        this.enabled = true;
    }

    // Genel mesaj gönder
    async sendMessage(message) {
        if (!this.enabled) {
            console.log('Telegram bildirimi (devre dışı):', message);
            return;
        }

        try {
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML'
            });
            console.log('Telegram mesajı gönderildi:', message);
        } catch (error) {
            console.error('Telegram mesajı gönderilemedi:', error.message);
        }
    }

    // Alım bildirimi
    async sendBuyAlert(symbol, price, quantity, score) {
        const message = `
🟢 <b>ALIM EMRİ VERİLDİ</b>

📊 <b>Sembol:</b> ${symbol}
💰 <b>Fiyat:</b> $${price}
📈 <b>Miktar:</b> ${quantity}
⭐ <b>Puan:</b> ${score}/10

🔍 <b>Teknik Analiz:</b>
• RSI: Düşük seviye (0-20)
• Fisher Transform: Aşırı satım (-1 altı)
• Volume: Destekleyici

⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }

    // Satım bildirimi
    async sendSellAlert(symbol, price, quantity, score, profit = null) {
        const profitText = profit ? `\n💵 <b>Kar/Zarar:</b> ${profit > 0 ? '+' : ''}${profit.toFixed(2)}%` : '';
        
        const message = `
🔴 <b>SATIM EMRİ VERİLDİ</b>

📊 <b>Sembol:</b> ${symbol}
💰 <b>Fiyat:</b> $${price}
📉 <b>Miktar:</b> ${quantity}
⭐ <b>Puan:</b> ${score}/10${profitText}

🔍 <b>Teknik Analiz:</b>
• RSI: Yüksek seviye (80-100)
• Fisher Transform: Aşırı alım (1-2)
• Volume: Destekleyici

⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }

    // Hata bildirimi
    async sendErrorAlert(error, context = '') {
        const message = `
⚠️ <b>HATA OLUŞTU</b>

🔧 <b>Bağlam:</b> ${context}
❌ <b>Hata:</b> ${error}

⏰ <b>Zaman:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }

    // Bot başlatma bildirimi
    async sendStartAlert() {
        const message = `
🚀 <b>CRYPTO BOT BAŞLATILDI</b>

✅ Bot aktif ve çalışıyor
📊 Sembol: ${process.env.SYMBOL || 'BTCUSDT'}
💰 İşlem miktarı: $${process.env.TRADE_AMOUNT || 10}
⏱️ Kontrol aralığı: ${(process.env.CHECK_INTERVAL || 30000) / 1000}s

⏰ <b>Başlatma zamanı:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }

    // Bot durdurma bildirimi
    async sendStopAlert() {
        const message = `
🛑 <b>CRYPTO BOT DURDURULDU</b>

⏰ <b>Durdurma zamanı:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }

    // Günlük rapor
    async sendDailyReport(stats) {
        const message = `
📈 <b>GÜNLÜK RAPOR</b>

📊 <b>İşlem Sayısı:</b> ${stats.totalTrades}
🟢 <b>Alım:</b> ${stats.buyTrades}
🔴 <b>Satım:</b> ${stats.sellTrades}
💰 <b>Toplam Kar/Zarar:</b> ${stats.totalProfit > 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}%

⏰ <b>Rapor zamanı:</b> ${new Date().toLocaleString('tr-TR')}
        `;
        
        await this.sendMessage(message);
    }
}

module.exports = TelegramService;