import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
o=Options(); o.add_argument("--headless=new"); o.add_argument("--hide-scrollbars")
d=webdriver.Chrome(options=o)
def m(w,h,mob): d.execute_cdp_cmd("Emulation.setDeviceMetricsOverride",{"width":w,"height":h,"deviceScaleFactor":1,"mobile":mob})
m(1280,800,False); d.get("http://127.0.0.1:8080"); time.sleep(4)
print("1280x800 CTA bottom:", d.execute_script("const b=document.querySelector('.voucher .btn-issue').getBoundingClientRect();return Math.round(b.bottom)"), "select text fits:", d.execute_script("const s=document.querySelector('.demo-instruction select');return s.scrollWidth<=s.clientWidth+2"))
m(390,844,True); d.get("http://127.0.0.1:8080"); time.sleep(4)
d.execute_script("window.scrollTo(0,1200)"); time.sleep(1)
print("mobile bar:", d.execute_script("const r=document.querySelector('.checkout-bar').getBoundingClientRect();return [getComputedStyle(document.querySelector('.checkout-bar')).position, Math.round(r.left), Math.round(r.bottom), innerHeight]"))
d.save_screenshot("mobile-bar-check.png")
d.quit()
