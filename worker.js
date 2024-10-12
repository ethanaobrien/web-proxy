
self.addEventListener("install", (event) => {
    self.skipWaiting();
});
/*
self.addEventListener("activate", (event) => {
    self.clients.claim();
});

function getLocation(parentLoc) {
    //console.log("LOC", parentLoc.pathname);
    if (parentLoc.pathname.startsWith("/http")) {
        let url = parentLoc.pathname.substring(1);
        if (url.startsWith('https:/') &&
            !url.startsWith('https://')) {
            url = url.replace('https:/', 'https://');
        }
        if (url.startsWith('http:/') &&
            !url.startsWith('http://')) {
            url = url.replace('http:/', 'http://');
        }
        if (url.startsWith('https://https:/')) {
            url = url.replace('https://https:/', 'https:/');
        }
        if (url.startsWith('http://http:/')) {
            url = url.replace('http://http:/', 'http:/');
        }
        return new URL(url);
    }
    return new URL("nyaa://cat.co/");
}

self.addEventListener("fetch", (event) => {
    const parentLoc = new URL(event.request.referrer);
    const loc = getLocation(parentLoc);
    const origLocation = new URL(event.request.url);
    let resourseLoc = new URL(event.request.url);

    if (!resourseLoc.origin.includes(".") && !resourseLoc.origin.includes(":")) {
        resourseLoc = new URL(loc);
        resourseLoc.pathname = origLocation.href.substring(origLocation.protocol.length + 2);
    }
    console.log(loc.host, loc.host);
    //console.log(resourseLoc.href, origLocation.href);
    if ((resourseLoc.pathname.startsWith("/http") && resourseLoc.href === origLocation.href) || loc.protocol === "nyaa:") {
        //console.log("asd");
        return;
    };
    const newPath = loc.protocol + "//" + loc.host + "/" + resourseLoc.href;
    console.log("newPath: ", newPath);
    console.log("oldPath: ", origLocation.href);
    event.respondWith(
        (() => {
            console.log("Fetching url " + newPath);
            return fetch(newPath);
        })()
    );
});

*/

