export class VUMeter {
    constructor(canvasId, analyserNode) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.analyser = analyserNode;
        this.ctx = this.canvas.getContext('2d');
        
        this.dataArray = new Float32Array(this.analyser.fftSize);
        this.peakDb = -100;
        this.currentDb = -100;
        
        // Settings
        this.minDb = -60;
        this.maxDb = 6;
        this.peakHoldTime = 800; // ms
        this.lastPeakTime = 0;
        
        this.gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, 0);
        this.gradient.addColorStop(0, '#10b981'); // Emerald (Safe)
        this.gradient.addColorStop(0.75, '#f59e0b'); // Amber (Warning)
        this.gradient.addColorStop(0.9, '#f43f5e'); // Rose (Peak)
        
        this.animationId = null;
        this.isActive = false;
    }

    start() {
        if (!this.isActive && this.canvas) {
            this.isActive = true;
            this.draw();
        }
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        // Reset canvas to dark state
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#0f172a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    draw() {
        if (!this.isActive) return;
        this.animationId = requestAnimationFrame(() => this.draw());
        
        this.analyser.getFloatTimeDomainData(this.dataArray);
        
        // Calculate RMS
        let sumSquares = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sumSquares += this.dataArray[i] * this.dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / this.dataArray.length);
        const db = 20 * Math.log10(rms || 1e-8);
        
        // Ballistics (Attack / Release)
        if (db > this.currentDb) {
            this.currentDb += (db - this.currentDb) * 0.4; // Fast attack
        } else {
            this.currentDb += (db - this.currentDb) * 0.08; // Smooth release
        }
        
        // Peak tracking
        const now = performance.now();
        if (this.currentDb > this.peakDb) {
            this.peakDb = this.currentDb;
            this.lastPeakTime = now;
        } else if (now - this.lastPeakTime > this.peakHoldTime) {
            this.peakDb -= 0.8; // Drop peak slowly
        }
        
        // Render
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const range = this.maxDb - this.minDb;
        
        const meterWidth = Math.max(0, Math.min(width, ((this.currentDb - this.minDb) / range) * width));
        
        // Draw background
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw meter
        if (meterWidth > 0) {
            this.ctx.fillStyle = this.gradient;
            this.ctx.fillRect(0, 0, meterWidth, height);
        }
        
        // Draw peak line
        const peakX = Math.max(0, Math.min(width, ((this.peakDb - this.minDb) / range) * width));
        if (peakX > 0) {
            this.ctx.fillStyle = (this.peakDb > -1) ? '#f43f5e' : '#ffffff';
            this.ctx.fillRect(peakX - 1, 0, 2, height);
        }
    }
}
