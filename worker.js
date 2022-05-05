addEventListener("fetch", async (e) => {
    console.log(e.request.url)
    if (self.location.hostname !== (new URL(e.request.url)).hostname) {
        var res;
        try {
            res = await fetch('//'+self.location.hostname+'/'+e.request.url.replace('://', ':/'));
        } catch(e) {return}
        e.respondWith(res);
    }
});
