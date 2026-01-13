class TradingBotDashboard {
    constructor() {
        this.updateInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startAutoUpdate();
        this.startChartRefresh();
        this.updateStatus();
    }

    setupEventListeners() {
        // Bot kontrol butonları
        document.getElementById('start-btn').addEventListener('click', () => this.controlBot('start'));
        document.getElementById('stop-btn').addEventListener('click', () => this.controlBot('stop'));
        document.getElementById('analyze-btn').addEventListener('click', () => this.manualAnalyze());
        document.getElementById('test-notification-btn').addEventListener('click', () => this.testNotification());
    }

    async controlBot(action) {
        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showNotification(result.message, 'success');
                this.updateStatus();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            this.showNotification('İşlem başarısız: ' + error.message, 'error');
        }
    }

    async manualAnalyze() {
        try {
            const response = await fetch('/api/analyze', { method: 'POST' });
            const analysis = await response.json();
            
            this.updateAnalysisDisplay(analysis);
            this.showNotification('Manuel analiz tamamlandı', 'success');
        } catch (error) {
            this.showNotification('Analiz başarısız: ' + error.message, 'error');
        }
    }

    async testNotification() {
        try {
            const response = await fetch('/api/test-notification', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Test bildirimi gönderildi', 'success');
            } else {
                this.showNotification('Bildirim gönderilemedi', 'error');
            }
        } catch (error) {
            this.showNotification('Bildirim hatası: ' + error.message, 'error');
        }
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            // Durum göstergesi
            const statusDot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            
            if (status.isRunning) {
                statusDot.className = 'status-dot online';
                statusText.textContent = 'Bot Aktif';
            } else {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'Bot Durmuş';
            }

            // Genel bilgiler
            document.getElementById('symbol').textContent = status.symbol || '-';
            document.getElementById('current-price').textContent = status.currentPrice ? 
                '$' + this.formatNumber(status.currentPrice) : '-';
            document.getElementById('uptime').textContent = this.formatUptime(status.uptime);
            document.getElementById('last-update').textContent = status.lastUpdate ? 
                new Date(status.lastUpdate).toLocaleString('tr-TR') : '-';

            // Trading izinleri
            const buyPermission = document.getElementById('buy-permission');
            const sellPermission = document.getElementById('sell-permission');
            
            if (status.allowBuyOrders) {
                buyPermission.textContent = '✅ Aktif';
                buyPermission.className = 'permission-status active';
            } else {
                buyPermission.textContent = '❌ Kapalı';
                buyPermission.className = 'permission-status inactive';
            }
            
            if (status.allowSellOrders) {
                sellPermission.textContent = '✅ Aktif';
                sellPermission.className = 'permission-status active';
            } else {
                sellPermission.textContent = '❌ Kapalı';
                sellPermission.className = 'permission-status inactive';
            }

            // Analiz verileri
            if (status.lastAnalysis) {
                this.updateAnalysisDisplay(status.lastAnalysis);
            }

            // Puanlama
            if (status.lastScore) {
                this.updateScoreDisplay(status.lastScore);
            }

        } catch (error) {
            console.error('Durum güncellenemedi:', error);
            document.getElementById('status-dot').className = 'status-dot offline';
            document.getElementById('status-text').textContent = 'Bağlantı Hatası';
        }
    }

    async updateTrades() {
        try {
            const response = await fetch('/api/trades?limit=10');
            const trades = await response.json();
            
            const container = document.getElementById('trades-container');
            
            if (trades.length === 0) {
                container.innerHTML = '<div class="no-data">Henüz işlem yok</div>';
                return;
            }

            container.innerHTML = trades.map(trade => `
                <div class="trade-item ${trade.action.toLowerCase()}">
                    <div class="trade-time">${new Date(trade.timestamp).toLocaleString('tr-TR')}</div>
                    <div class="trade-details">
                        ${trade.action} - ${trade.symbol} - $${this.formatNumber(trade.price)} 
                        - ${trade.quantity} - Puan: ${trade.score}/10
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('İşlemler güncellenemedi:', error);
        }
    }

    async updateStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            
            document.getElementById('total-trades').textContent = stats.totalTrades;
            document.getElementById('buy-trades').textContent = stats.buyTrades;
            document.getElementById('sell-trades').textContent = stats.sellTrades;
            
            const profitElement = document.getElementById('total-profit');
            profitElement.textContent = stats.totalProfit + '%';
            profitElement.style.color = stats.totalProfit >= 0 ? '#4CAF50' : '#f44336';

        } catch (error) {
            console.error('İstatistikler güncellenemedi:', error);
        }
    }

    async updateAccount() {
        try {
            const response = await fetch('/api/account');
            const account = await response.json();
            
            // Asset labellarını güncelle
            document.getElementById('quote-asset-label').textContent = 
                `${account.quoteAsset} Bakiye:`;
            document.getElementById('base-asset-label').textContent = 
                `${account.baseAsset} Bakiye:`;
            
            // Bakiyeleri güncelle
            document.getElementById('quote-balance').textContent = 
                this.formatNumber(account.quoteBalance) + ' ' + account.quoteAsset;
            document.getElementById('base-balance').textContent = 
                this.formatNumber(account.baseBalance, 6) + ' ' + account.baseAsset;

        } catch (error) {
            console.error('Hesap bilgileri güncellenemedi:', error);
        }
    }

    updateAnalysisDisplay(analysis) {
        // RSI
        document.getElementById('rsi-value').textContent = this.formatNumber(analysis.rsi, 1);
        document.getElementById('rsi-progress').style.width = analysis.rsi + '%';

        // Fisher Transform (-2 ile +2 arası, 0-100% olarak göster)
        const fisherPercent = ((analysis.fisher + 2) / 4) * 100;
        document.getElementById('fisher-value').textContent = this.formatNumber(analysis.fisher, 2);
        document.getElementById('fisher-progress').style.width = Math.max(0, Math.min(100, fisherPercent)) + '%';

        // Volume Score (0-1 arası, 0-100% olarak göster)
        document.getElementById('volume-value').textContent = this.formatNumber(analysis.volumeScore, 2);
        document.getElementById('volume-progress').style.width = (analysis.volumeScore * 100) + '%';
    }

    updateScoreDisplay(scoreData) {
        // Alım puanı
        document.getElementById('buy-score').textContent = this.formatNumber(scoreData.buy.total, 1);
        document.getElementById('buy-stars').textContent = this.generateStars(scoreData.buy.total);

        // Satım puanı
        document.getElementById('sell-score').textContent = this.formatNumber(scoreData.sell.total, 1);
        document.getElementById('sell-stars').textContent = this.generateStars(scoreData.sell.total);

        // Öneri
        const recommendationElement = document.getElementById('recommendation');
        const action = scoreData.recommendation.action;
        recommendationElement.textContent = this.translateAction(action);
        recommendationElement.className = 'recommendation-text ' + action;
    }

    generateStars(score) {
        const fullStars = Math.floor(score / 2);
        const halfStar = (score % 2) >= 1;
        const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
        
        return '★'.repeat(fullStars) + 
               (halfStar ? '☆' : '') + 
               '☆'.repeat(emptyStars);
    }

    translateAction(action) {
        const translations = {
            'BUY': 'ALIM',
            'SELL': 'SATIM',
            'HOLD': 'BEKLE'
        };
        return translations[action] || action;
    }

    formatNumber(num, decimals = 2) {
        if (num === null || num === undefined) return '0';
        return parseFloat(num).toFixed(decimals);
    }

    formatUptime(ms) {
        if (!ms) return '0s';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}g ${hours % 24}s`;
        if (hours > 0) return `${hours}s ${minutes % 60}d`;
        if (minutes > 0) return `${minutes}d ${seconds % 60}s`;
        return `${seconds}s`;
    }

    showNotification(message, type = 'info') {
        // Basit bildirim sistemi
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        if (type === 'success') {
            notification.style.background = '#4CAF50';
        } else if (type === 'error') {
            notification.style.background = '#f44336';
        } else {
            notification.style.background = '#2196F3';
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    startAutoUpdate() {
        // İlk yükleme
        this.updateStatus();
        this.updateTrades();
        this.updateStats();
        this.updateAccount();

        // Otomatik güncelleme
        this.updateInterval = setInterval(() => {
            this.updateStatus();
            this.updateTrades();
            this.updateStats();
        }, 30*1000); // 30 saniyede bir güncelle

        // Hesap bilgileri daha az sıklıkta
        setInterval(() => {
            this.updateAccount();
        }, 60*1000); // 60 saniyede bir
        
        // Chart'ı her dakika yenile
        this.startChartRefresh();
    }

    startChartRefresh() {
        // Chart'ı her dakika yenile
        setInterval(() => {
            this.refreshChart();
        }, 60000); // 60 saniye = 1 dakika
        
        console.log('📈 Chart otomatik yenileme başlatıldı (1 dakika)');
    }

    refreshChart() {
        const chartImg = document.querySelector('.binance-chart');
        if (chartImg) {
            // Timestamp ekleyerek cache'i bypass et
            const timestamp = new Date().getTime();
            const baseUrl = 'https://www.binance.tr/proxy/bin/kline/BTCUSDT.svg';
            chartImg.src = `${baseUrl}?t=${timestamp}`;
            
            console.log('📈 Chart yenilendi:', new Date().toLocaleTimeString('tr-TR'));
            
            // Görsel feedback - kısa bir fade efekti
            chartImg.style.opacity = '0.5';
            setTimeout(() => {
                chartImg.style.opacity = '0.9';
            }, 200);
        }
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

// CSS animasyonları
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Dashboard'u başlat
document.addEventListener('DOMContentLoaded', () => {
    new TradingBotDashboard();
});