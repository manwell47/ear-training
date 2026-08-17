function calculateRMS() {
    const sampleRate = 44100;
    const duration = 5.0;
    const bufferSize = sampleRate * duration;
    
    // Calculate White Noise RMS
    let sumSqWhite = 0;
    for (let i = 0; i < bufferSize; i++) {
        let white = (Math.random() * 2 - 1) * 0.15;
        sumSqWhite += white * white;
    }
    let rmsWhite = Math.sqrt(sumSqWhite / bufferSize);
    let rmsWhiteDB = 20 * Math.log10(rmsWhite);

    // Calculate Pink Noise RMS
    let sumSqPink = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let maxPeak = 0;
    let pinkData = new Float32Array(bufferSize);
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        pinkData[i] = pink;
        if (Math.abs(pink) > maxPeak) maxPeak = Math.abs(pink);
    }
    
    if (maxPeak > 0) {
        const normFactor = 0.15 / maxPeak; 
        for (let i = 0; i < bufferSize; i++) {
            pinkData[i] *= normFactor;
            sumSqPink += pinkData[i] * pinkData[i];
        }
    }
    let rmsPink = Math.sqrt(sumSqPink / bufferSize);
    let rmsPinkDB = 20 * Math.log10(rmsPink);

    console.log("White Noise RMS: " + rmsWhiteDB.toFixed(2) + " dBFS");
    console.log("Pink Noise RMS: " + rmsPinkDB.toFixed(2) + " dBFS");
    console.log("Pink Noise Max Peak before norm: " + maxPeak);
}

calculateRMS();
