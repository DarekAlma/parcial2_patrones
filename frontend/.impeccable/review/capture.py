import time, base64
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
URL="http://127.0.0.1:8080"
JS="""
const done=arguments[arguments.length-1];
(async()=>{const q=(query,variables)=>fetch('/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables})}).then(r=>r.json());
const id=Math.random().toString(36).slice(2,7);
await q('mutation($i:RegisterInput!){register(input:$i){user{id}}}',{i:{email:'cap.'+id+'@wandersync.test',fullName:'Valentina Ruiz',password:'Captura'+id+'2026'}});
const d=(await q('{destinations{searchKey hotelOffers carOffers}}')).data.destinations.find(x=>x.hotelOffers&&x.carOffers);
const p=(await q('query($k:String!){packageSearch(searchKey:$k){flights(limit:12){id seatsAvailable} hotels(limit:12){id roomsAvailable} cars(limit:12){id unitsAvailable}}}',{k:d.searchKey})).data.packageSearch;
const fl=p.flights.find(x=>x.seatsAvailable>2),ho=p.hotels.filter(x=>x.roomsAvailable>2),ca=p.cars.filter(x=>x.unitsAvailable>2);
const ids=[];
for (const [i,f] of ['CAR','NONE'].entries()) ids.push((await q('mutation($i:BookPackageInput!){bookPackage(input:$i){id}}',{i:{flightOfferId:fl.id,hotelOfferId:ho[i].id,carOfferId:ca[i].id,simulateFailure:f}})).data.bookPackage.id);
done(ids)})().catch(e=>done(String(e)));
"""
def metrics(d,w,h,mobile):
    d.execute_cdp_cmd("Emulation.setDeviceMetricsOverride",{"width":w,"height":h,"deviceScaleFactor":2 if mobile else 1,"mobile":mobile})
def shoot(d,name,w,mobile,vh):
    time.sleep(2)
    h=d.execute_script("return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")
    metrics(d,w,h,mobile); time.sleep(1.2)
    print(name,"innerWidth=",d.execute_script("return window.innerWidth"),"h=",h)
    png=d.execute_cdp_cmd("Page.captureScreenshot",{"format":"png","captureBeyondViewport":True})
    open(name,"wb").write(base64.b64decode(png["data"]))
    metrics(d,w,vh,mobile); time.sleep(0.5)
def tab(d,label):
    for b in d.find_elements("css selector",".folder-tab"):
        if b.text.strip()==label: b.click(); return
def click_order(d,idx):
    els=d.find_elements("css selector",".filed"); els[idx].click()
o=Options(); o.add_argument("--headless=new"); o.add_argument("--hide-scrollbars"); o.add_argument("--window-size=1440,900")
d=webdriver.Chrome(options=o); d.set_script_timeout(60)
for (w,vh,mobile,pre) in [(1440,900,False,"desktop"),(390,844,True,"mobile")]:
    metrics(d,w,vh,mobile)
    d.get(URL); time.sleep(3)
    if pre=="desktop": print("orders",d.execute_async_script(JS))
    d.get(URL); time.sleep(4)
    shoot(d,f"{pre}.png",w,mobile,vh)
    tab(d,"Mis reservas"); time.sleep(30)
    # orden más reciente = confirmada (NONE se creó después)
    click_order(d,0); shoot(d,f"{pre}-orders.png",w,mobile,vh)
    click_order(d,1); time.sleep(3); shoot(d,f"{pre}-orders-failed.png",w,mobile,vh)
    tab(d,"Ingesta de datos"); time.sleep(3)
    d.execute_script("var t=[...document.querySelectorAll('.row-toggle')].find(e=>e.offsetParent); t && t.click()")
    shoot(d,f"{pre}-ingestion.png",w,mobile,vh)
    if pre=="desktop":
        tab(d,"Armar paquete"); time.sleep(3)
        d.find_element("css selector",".inspector-toggle").click(); time.sleep(1)
        ops=d.find_elements("css selector",".op")
        for op in ops:
            if "PackageSearch" in op.text: op.click(); break
        metrics(d,w,vh,mobile); time.sleep(1)
        png=d.execute_cdp_cmd("Page.captureScreenshot",{"format":"png"}); open("desktop-inspector.png","wb").write(base64.b64decode(png["data"])); print("desktop-inspector.png")
        d.find_element("css selector",".inspector-toggle").click()
d.quit()
