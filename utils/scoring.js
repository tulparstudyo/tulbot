class ScoringSystem {
    constructor() {
        this.rsiWeight = parseFloat(process.env.RSI_WEIGHT) || 0.4;
        this.fisherWeight = parseFloat(process.env.FISHER_WEIGHT) || 0.4;
        this.volumeWeight = parseFloat(process.env.VOLUME_WEIGHT) || 0.2;
        this.maxScore = 10;
    }

    // Stochastic RSI puanı hesapla (0-10 arası) - Binance uyumlu
    calculateStochRSIScore(stochRSI, action) {
        const k = stochRSI.k;
        
        if (action === 'BUY') {
            // Alım için: Stoch RSI 0-20 arası en yüksek puan
            if (k <= 20) {
                return 10 * (20 - k) / 20; // 0'da 10 puan, 20'de 0 puan
            }
            return 0;
        } else if (action === 'SELL') {
            // Satım için: Stoch RSI 80-100 arası en yüksek puan
            if (k >= 80) {
                return 10 * (k - 80) / 20; // 80'de 0 puan, 100'de 10 puan
            }
            return 0;
        }
        return 0;
    }

    // RSI puanı hesapla (geriye uyumluluk için)
    calculateRSIScore(rsi, action) {
        return this.calculateStochRSIScore({ k: rsi }, action);
    }

    // Fisher Transform puanı hesapla (0-10 arası)
    calculateFisherScore(fisher, action) {
        if (action === 'BUY') {
            // Alım için: Fisher -1 ile -2 altı en yüksek puan
            if (fisher <= -1) {
                const score = Math.min(10, 10 * (Math.abs(fisher) - 1)); // -1'de 0, -2'de 10 puan
                return Math.max(0, score);
            }
            return 0;
        } else if (action === 'SELL') {
            // Satım için: Fisher 1-2 arası en yüksek puan
            if (fisher >= 1) {
                const score = Math.min(10, 10 * (fisher - 1)); // 1'de 0, 2'de 10 puan
                return score;
            }
            return 0;
        }
        return 0;
    }

    // Volume puanı hesapla (0-10 arası)
    calculateVolumeScore(volumeScore) {
        // Volume score 0-1 arası gelir, bunu 0-10'a çevir
        return volumeScore * 10;
    }

    // Ağırlıklı toplam puan hesapla
    calculateWeightedScore(analysis, action) {
        const stochRSIScore = this.calculateStochRSIScore(analysis.stochRSI || { k: analysis.rsi }, action);
        const fisherScore = this.calculateFisherScore(analysis.fisher, action);
        const volScore = this.calculateVolumeScore(analysis.volumeScore);

        const weightedScore = (
            stochRSIScore * this.rsiWeight +
            fisherScore * this.fisherWeight +
            volScore * this.volumeWeight
        );

        console.log(`   Puan detayları (${action}):`);
        console.log(`     Stoch RSI: ${stochRSIScore.toFixed(2)} x ${this.rsiWeight} = ${(stochRSIScore * this.rsiWeight).toFixed(2)}`);
        console.log(`     Fisher: ${fisherScore.toFixed(2)} x ${this.fisherWeight} = ${(fisherScore * this.fisherWeight).toFixed(2)}`);
        console.log(`     Volume: ${volScore.toFixed(2)} x ${this.volumeWeight} = ${(volScore * this.volumeWeight).toFixed(2)}`);
        console.log(`     Toplam: ${weightedScore.toFixed(2)}`);

        return Math.min(this.maxScore, Math.max(0, weightedScore));
    }

    // Alım puanı hesapla
    calculateBuyScore(analysis) {
        return this.calculateWeightedScore(analysis, 'BUY');
    }

    // Satım puanı hesapla
    calculateSellScore(analysis) {
        return this.calculateWeightedScore(analysis, 'SELL');
    }

    // Detaylı puan raporu
    getDetailedScore(analysis) {
        const buyScore = this.calculateBuyScore(analysis);
        const sellScore = this.calculateSellScore(analysis);

        const buyDetails = {
            stochRSI: this.calculateStochRSIScore(analysis.stochRSI || { k: analysis.rsi }, 'BUY'),
            fisher: this.calculateFisherScore(analysis.fisher, 'BUY'),
            volume: this.calculateVolumeScore(analysis.volumeScore),
            total: buyScore
        };

        const sellDetails = {
            stochRSI: this.calculateStochRSIScore(analysis.stochRSI || { k: analysis.rsi }, 'SELL'),
            fisher: this.calculateFisherScore(analysis.fisher, 'SELL'),
            volume: this.calculateVolumeScore(analysis.volumeScore),
            total: sellScore
        };

        return {
            buy: buyDetails,
            sell: sellDetails,
            recommendation: this.getRecommendation(buyScore, sellScore),
            analysis: {
                rsi: analysis.rsi,
                stochRSI: analysis.stochRSI,
                fisher: analysis.fisher,
                volumeScore: analysis.volumeScore,
                currentPrice: analysis.currentPrice
            }
        };
    }

    // Öneri ver
    getRecommendation(buyScore, sellScore) {
        const threshold = 7; // Minimum puan eşiği

        if (buyScore >= threshold && buyScore > sellScore) {
            return {
                action: 'BUY',
                confidence: buyScore / this.maxScore,
                score: buyScore
            };
        }

        if (sellScore >= threshold && sellScore > buyScore) {
            return {
                action: 'SELL',
                confidence: sellScore / this.maxScore,
                score: sellScore
            };
        }

        return {
            action: 'HOLD',
            confidence: 0,
            score: Math.max(buyScore, sellScore)
        };
    }

    // Puan formatla (görüntüleme için)
    formatScore(score) {
        return {
            value: parseFloat(score.toFixed(2)),
            percentage: parseFloat((score / this.maxScore * 100).toFixed(1)),
            stars: '★'.repeat(Math.round(score / 2)) + '☆'.repeat(5 - Math.round(score / 2))
        };
    }
}

module.exports = ScoringSystem;