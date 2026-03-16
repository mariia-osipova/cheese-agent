const INTERVAL = 8000;
const imgDir   = "cheese-folder/";
fetch(imgDir)
    .then(r => r.text())
    .then(html => {
        const re = /href="([^?][^"]+\.(?:png|jpe?g))/gi;
        const files = [...html.matchAll(re)].map(m => imgDir + m[1]);
        cycle(files);
    });

function cycle(arr){
    let idx = 0;
    setBg(arr[idx]);
    setInterval(() => {
        idx = (idx+1) % arr.length;
        setBg(arr[idx]);
    }, INTERVAL);
}

function setBg(url){
    document.documentElement.style.backgroundImage = `url("${url}")`;
}
