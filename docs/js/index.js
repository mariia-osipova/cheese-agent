import { images } from './images.js';

function pick() {
    return images[Math.floor(Math.random() * images.length)];
}

if (images.length > 0) {
    document.body.style.backgroundImage = `url('${pick()}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
}

// Expose for the selfie overlay — prefer PNGs (likely transparent)
window.CHEESE_IMAGES = images;
window.CHEESE_PNGS   = images.filter(p => p.toLowerCase().endsWith('.png'));
