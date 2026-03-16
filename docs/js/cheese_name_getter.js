// index.js
const fs = require('fs');
const path = require('path');

// go from /docs/js → ../../cheese-backend/cheese
const dir = path.join(__dirname, '../../cheese-backend/cheese');

// find all image files and build relative browser-friendly paths
let images = [];
try {
    images = fs
        .readdirSync(dir)
        .filter(f => /\.(jpe?g|png|gif)$/i.test(f))
        .map(f => `../cheese-backend/cheese/${f}`);
} catch (err) {
    console.error(`Failed to read directory "${dir}":`, err);
}

// write the array into images.js as an ES module export
fs.writeFileSync(
    path.join(__dirname, 'images.js'),
    `export const images = ${JSON.stringify(images, null, 2)};`
);

console.log(`✅ wrote ${images.length} entries to images.js`);
