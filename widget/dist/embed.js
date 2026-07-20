(()=>{var O=`/* Compiled into the open shadow root (TD-1). System font stack only:\r
   @font-face does not apply inside shadow roots. RTL-ready: logical\r
   properties (margin-inline / inset-inline) instead of left/right. */\r
\r
:host {\r
  all: initial;\r
  display: block;\r
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;\r
  color: #1a1a1a;\r
  line-height: 1.45;\r
}\r
\r
.wgc-wrap {\r
  box-sizing: border-box;\r
  min-height: 520px; /* reserved height: no layout shift on load */\r
  max-width: 480px;\r
  padding: 20px;\r
  border: 1px solid #d9d9d9;\r
  border-radius: 8px;\r
  background: #ffffff;\r
}\r
\r
.wgc-wrap *,\r
.wgc-wrap *::before,\r
.wgc-wrap *::after {\r
  box-sizing: border-box;\r
  font-family: inherit;\r
}\r
\r
.wgc-title {\r
  margin: 0 0 4px;\r
  font-size: 20px;\r
  font-weight: 700;\r
}\r
\r
.wgc-sub {\r
  margin: 0 0 16px;\r
  font-size: 14px;\r
  color: #444444;\r
}\r
\r
.wgc-field {\r
  margin-block-end: 12px;\r
}\r
\r
.wgc-row {\r
  display: flex;\r
  gap: 12px;\r
}\r
\r
.wgc-row .wgc-field {\r
  flex: 1 1 0;\r
  min-width: 0;\r
}\r
\r
.wgc-label {\r
  display: block;\r
  margin-block-end: 4px;\r
  font-size: 13px;\r
  font-weight: 600;\r
}\r
\r
.wgc-input {\r
  width: 100%;\r
  padding: 10px 12px;\r
  font-size: 16px; /* >=16px stops iOS Safari zoom-on-focus */\r
  border: 1px solid #8c8c8c;\r
  border-radius: 6px;\r
  background: #ffffff;\r
  color: #1a1a1a;\r
}\r
\r
.wgc-input:focus,\r
.wgc-check input:focus,\r
.wgc-seg-opt:focus,\r
.wgc-btn:focus,\r
.wgc-link:focus,\r
.wgc-launcher:focus {\r
  outline: 3px solid #1a56b0;\r
  outline-offset: 1px;\r
}\r
\r
.wgc-input[aria-invalid="true"] {\r
  border-color: #b3261e;\r
}\r
\r
.wgc-err {\r
  display: block;\r
  margin-block-start: 4px;\r
  font-size: 13px;\r
  color: #b3261e;\r
  min-height: 1em;\r
}\r
\r
/* Segmented single-select (bedrooms) */\r
.wgc-seg {\r
  display: flex;\r
  gap: 8px;\r
}\r
\r
.wgc-seg-opt {\r
  flex: 1 1 0;\r
  min-height: 44px; /* touch target */\r
  padding: 10px 8px;\r
  font-size: 16px;\r
  font-weight: 600;\r
  color: #1a56b0;\r
  background: #ffffff;\r
  border: 1px solid #8c8c8c;\r
  border-radius: 6px;\r
  cursor: pointer;\r
}\r
\r
.wgc-seg-opt[aria-checked="true"] {\r
  color: #ffffff;\r
  background: #1a56b0;\r
  border-color: #1a56b0;\r
}\r
\r
.wgc-check {\r
  display: flex;\r
  gap: 8px;\r
  align-items: flex-start;\r
  margin-block: 14px;\r
}\r
\r
.wgc-check input {\r
  flex: 0 0 auto;\r
  width: 18px;\r
  height: 18px;\r
  margin-block-start: 2px;\r
}\r
\r
.wgc-check label {\r
  font-size: 13px;\r
  color: #333333;\r
}\r
\r
.wgc-btn {\r
  display: block;\r
  width: 100%;\r
  padding: 12px 16px;\r
  font-size: 16px;\r
  font-weight: 700;\r
  color: #ffffff;\r
  background: #1a56b0;\r
  border: 0;\r
  border-radius: 6px;\r
  cursor: pointer;\r
}\r
\r
.wgc-btn[disabled] {\r
  background: #7a95bd;\r
  cursor: default;\r
}\r
\r
.wgc-fineprint {\r
  margin: 10px 0 0;\r
  font-size: 12px;\r
  color: #555555;\r
  text-align: center;\r
}\r
\r
.wgc-privacy {\r
  display: block;\r
  margin-block-start: 8px;\r
  font-size: 12px;\r
  text-align: center;\r
}\r
\r
.wgc-link {\r
  color: #1a56b0;\r
}\r
\r
.wgc-status {\r
  margin: 0 0 12px;\r
  font-size: 14px;\r
}\r
\r
.wgc-status[data-kind="error"] {\r
  color: #b3261e;\r
}\r
\r
/* Success / result states */\r
.wgc-panel {\r
  min-height: 460px;\r
  display: flex;\r
  flex-direction: column;\r
  justify-content: center;\r
  text-align: center;\r
  gap: 12px;\r
}\r
\r
.wgc-result {\r
  justify-content: flex-start;\r
  padding-block-start: 8px;\r
}\r
\r
.wgc-range {\r
  margin: 4px 0;\r
  font-size: 30px;\r
  font-weight: 800;\r
  color: #1a56b0;\r
}\r
\r
.wgc-range-unit {\r
  font-size: 16px;\r
  font-weight: 600;\r
  color: #444444;\r
}\r
\r
.wgc-comps-heading {\r
  margin: 8px 0 4px;\r
  font-weight: 600;\r
}\r
\r
.wgc-comps {\r
  list-style: none;\r
  margin: 0 0 8px;\r
  padding: 0;\r
  text-align: start;\r
}\r
\r
.wgc-comp {\r
  display: flex;\r
  justify-content: space-between;\r
  gap: 8px;\r
  padding: 8px 0;\r
  border-block-end: 1px solid #ececec;\r
  font-size: 13px;\r
}\r
\r
.wgc-comp-rent {\r
  font-weight: 700;\r
  white-space: nowrap;\r
}\r
\r
.wgc-ebook-note {\r
  color: #1a7a3c;\r
  font-weight: 600;\r
}\r
\r
.wgc-thanks {\r
  margin-block-start: 8px;\r
}\r
\r
/* Honeypot: visually removed but still in the DOM for naive bots.\r
   display:none is deliberately avoided (some bots skip hidden fields). */\r
.wgc-hp {\r
  position: absolute !important;\r
  inset-inline-start: -9999px !important;\r
  width: 1px;\r
  height: 1px;\r
  overflow: hidden;\r
}\r
\r
/* Popup/modal launch mode (data-mode="popup"). Approved brand chrome,\r
   isolated to this shadow root: navy header (#002045), red CTA matching\r
   .wgc-btn (#b61710), amber "free guide" ribbon (#e8b04b), off-white modal\r
   body (#fbf9f8). The overlay is position:fixed so it covers the viewport\r
   even though #wgc-analysis (the shadow host) is a small inline element --\r
   Shadow DOM does not create a new containing block by itself. */\r
.wgc-launcher {\r
  display: inline-block;\r
  padding: 12px 20px;\r
  font-size: 16px;\r
  font-weight: 700;\r
  color: #ffffff;\r
  background: #b61710;\r
  border: 0;\r
  border-radius: 6px;\r
  cursor: pointer;\r
}\r
\r
.wgc-launcher:hover {\r
  background: #96120c;\r
}\r
\r
.wgc-overlay {\r
  position: fixed;\r
  inset: 0;\r
  z-index: 2147483000;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  padding: 16px;\r
  overflow-y: auto;\r
  background: rgba(0, 0, 0, 0.55);\r
  /* opacity+visibility (not display) so the open transition is real and\r
     the closed overlay is still un-hit-testable and out of the a11y tree. */\r
  opacity: 0;\r
  visibility: hidden;\r
  transition: opacity 0.18s ease, visibility 0s linear 0.18s;\r
}\r
\r
.wgc-overlay.wgc-open {\r
  opacity: 1;\r
  visibility: visible;\r
  transition: opacity 0.18s ease, visibility 0s linear 0s;\r
}\r
\r
@media (prefers-reduced-motion: reduce) {\r
  .wgc-overlay {\r
    transition: none;\r
  }\r
}\r
\r
.wgc-modal {\r
  box-sizing: border-box;\r
  width: 100%;\r
  max-width: 480px;\r
  max-height: 90vh;\r
  overflow-y: auto;\r
  background: #fbf9f8;\r
  border-radius: 10px;\r
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);\r
}\r
\r
.wgc-modal-header {\r
  position: sticky;\r
  inset-block-start: 0;\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: 12px;\r
  padding: 14px 16px;\r
  background: #002045;\r
  border-start-start-radius: 10px;\r
  border-start-end-radius: 10px;\r
}\r
\r
.wgc-modal-ribbon {\r
  font-size: 12px;\r
  font-weight: 700;\r
  color: #1a1200;\r
  background: #e8b04b;\r
  padding: 4px 10px;\r
  border-radius: 999px;\r
  white-space: nowrap;\r
}\r
\r
.wgc-modal-close {\r
  flex: 0 0 auto;\r
  width: 44px;\r
  height: 44px;\r
  display: flex;\r
  align-items: center;\r
  justify-content: center;\r
  font-size: 22px;\r
  line-height: 1;\r
  color: #ffffff;\r
  background: transparent;\r
  border: 0;\r
  border-radius: 6px;\r
  cursor: pointer;\r
}\r
\r
.wgc-modal-close:hover {\r
  background: rgba(255, 255, 255, 0.15);\r
}\r
\r
.wgc-modal-close:focus {\r
  outline: 3px solid #e8b04b;\r
  outline-offset: 2px;\r
}\r
\r
.wgc-modal-body {\r
  padding: 4px;\r
}\r
\r
/* The reused wgc-wrap card loses its own border/background/sizing inside\r
   the modal -- the dialog panel supplies that chrome instead. */\r
.wgc-modal .wgc-wrap {\r
  border: 0;\r
  background: transparent;\r
  max-width: none;\r
  min-height: 0;\r
}\r
`;var $=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,V=/^\d{5}$/,C=["2","3","4","5+"],A={name:{min:1,max:120},email:{max:254},sqft:{min:300,max:1e4},bedrooms:{options:C}};function J(e){let t=String(e==null?"":e).trim();return t.length<A.name.min||t.length>A.name.max?null:t}function X(e){let t=String(e==null?"":e).trim();return t.length>A.email.max||!$.test(t)?null:t}function Q(e){let t=String(e==null?"":e).trim(),n=t.replace(/\D/g,"");return t.startsWith("+")&&!t.startsWith("+1")?null:t.startsWith("+")?n.length===11?"+"+n:null:n.length===10?"+1"+n:n.length===11&&n[0]==="1"?"+"+n:null}function ee(e){let t=String(e==null?"":e).trim();return V.test(t)?t:null}function te(e){let t=String(e==null?"":e).trim();if(t==="")return null;let n=Number(t);return!Number.isFinite(n)||!Number.isInteger(n)||n<A.sqft.min||n>A.sqft.max?null:n}function ne(e){let t=String(e==null?"":e).trim();return t===""?null:C.indexOf(t)!==-1?t:void 0}function B(e){let t={},n={};return n.name=J(e.name),n.name===null&&(t.name="Enter your name."),n.email=X(e.email),n.email===null&&(t.email="Enter a valid email address."),n.phone=Q(e.phone),n.phone===null&&(t.phone="Enter a valid US phone number (10 digits)."),n.zip=ee(e.zip),n.zip===null&&(t.zip="Enter a 5-digit ZIP code."),n.sqft=te(e.sqft),n.sqft===null&&(t.sqft="Enter square footage between 300 and 10,000."),n.bedrooms=ne(e.bedrooms),n.bedrooms===void 0&&(t.bedrooms="Choose 2, 3, 4, or 5+."),Object.keys(t).length?{ok:!1,errors:t}:{ok:!0,data:n}}var re="v2-2026-07-16",N="https://main-production-bf72.up.railway.app/webhook/d043c102d78e";function D(e,t){let n=new AbortController,i=setTimeout(function(){n.abort()},1e4),r=Object.assign({},t,{signal:n.signal});return fetch(e,r).finally(function(){clearTimeout(i)})}function M(e){let t=null,n=0;function i(){return D(e+"/token",{method:"GET"}).then(function(l){if(!l.ok)throw new Error("token fetch failed: "+l.status);return l.text()}).then(function(l){return t=l.trim(),n=Date.now(),t})}function r(){return t&&Date.now()-n<36e5?Promise.resolve(t):i().catch(function(){return t})}return{refresh:i,ensureFresh:r,get:function(){return t}}}function R(){if(typeof crypto.randomUUID=="function")return crypto.randomUUID();let e=crypto.getRandomValues(new Uint8Array(16));e[6]=e[6]&15|64,e[8]=e[8]&63|128;let t=Array.prototype.map.call(e,function(n){return(n+256).toString(16).slice(1)}).join("");return t.slice(0,8)+"-"+t.slice(8,12)+"-"+t.slice(12,16)+"-"+t.slice(16,20)+"-"+t.slice(20)}function H(e,t){return{submission_id:t.submissionId,name:e.name,email:e.email,phone:e.phone,zip:e.zip,sqft:e.sqft,bedrooms:e.bedrooms==null?null:e.bedrooms,ebook_opt_in:e.ebook_opt_in===!0,consent:{implied:!0,text_version:re,ts:new Date().toISOString()}}}function F(e,t,n){let i=Object.assign({},t,{token:n.token||"",fax:n.honeypot||"",fill_ms:n.fillMs});return D(e+"/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)}).then(function(r){if(!r.ok)throw new Error("submit failed: "+r.status);return r.json().catch(function(){return{}})})}var m={finePrint:"By requesting your analysis, you agree Westrom Group may contact you about your property.",ebookLabel:"Also send me the free guide: How to Hire the Best Property Manager for You",ebookSent:"Your free guide is on its way to your inbox.",receivedTitle:"Request received",receivedBody:"Your analysis will be prepared by the Westrom team. We will be in touch shortly.",estimateTitle:"Your estimated rent range",compsHeading:"Recent nearby rentals",cta:"Get a free expert review",thanksTitle:"You are all set",thanksBody:"A Westrom specialist will review your property and follow up with a human-prepared analysis."};function s(e){return String(e==null?"":e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function oe(e){return e&&typeof e=="object"&&e.estimate?"estimate":"received"}function q(e){let t=Number(e);return Number.isFinite(t)?"$"+Math.round(t).toLocaleString("en-US"):""}function P(e){return e&&e.ebookOptIn?'<p class="wgc-sub wgc-ebook-note">'+s(m.ebookSent)+"</p>":""}function ie(e){let t=[];e.zip!=null&&e.zip!==""&&t.push("ZIP "+s(e.zip)),e.beds!=null&&e.beds!==""&&t.push(s(e.beds)+" bd"),e.sqft!=null&&e.sqft!==""&&t.push(Number(e.sqft).toLocaleString("en-US")+" sqft"),e.ago_days!=null&&e.ago_days!==""&&t.push(s(e.ago_days)+" days ago");let n=q(e.rent);return'<li class="wgc-comp"><span class="wgc-comp-meta">'+t.join(" &middot; ")+"</span>"+(n?'<span class="wgc-comp-rent">'+n+"/mo</span>":"")+"</li>"}function ae(e){return'<div class="wgc-panel" role="status" aria-live="assertive"><h2 class="wgc-title" id="wgc-dyn-title">'+s(m.receivedTitle)+'</h2><p class="wgc-sub">'+s(m.receivedBody)+"</p>"+P(e)+"</div>"}function le(e,t){let n=q(e.low),i=q(e.high),r=n&&i?n+" &ndash; "+i:n||i||"",l=Array.isArray(e.comps)?e.comps.slice(0,3):[],a=l.length?'<p class="wgc-sub wgc-comps-heading">'+s(m.compsHeading)+'</p><ul class="wgc-comps">'+l.map(ie).join("")+"</ul>":"";return'<div class="wgc-panel wgc-result" role="status" aria-live="assertive"><h2 class="wgc-title" id="wgc-dyn-title">'+s(m.estimateTitle)+'</h2><p class="wgc-range">'+r+'<span class="wgc-range-unit">/mo</span></p>'+a+P(t)+'<button class="wgc-btn" type="button" id="wgc-cta">'+s(m.cta)+'</button><div class="wgc-thanks" id="wgc-thanks" hidden><h3 class="wgc-title">'+s(m.thanksTitle)+'</h3><p class="wgc-sub">'+s(m.thanksBody)+"</p></div></div>"}function U(e,t){return oe(e)==="estimate"?le(e.estimate||{},t):ae(t)}var z={defaultLaunchLabel:"Get My Free Rental Analysis",ribbon:"Free guide included",close:"Close"},se="a[href], button, input, select, textarea, [tabindex]";function j(e){var t=Array.prototype.slice.call(e.querySelectorAll(se));return t.filter(function(n){return!(n.hasAttribute("disabled")||n.getAttribute("type")==="hidden"||n.getAttribute("tabindex")==="-1")})}function ce(e,t,n){if(!e.length)return-1;var i=e.indexOf(t);return n?i<=0?e.length-1:i-1:i===-1||i===e.length-1?0:i+1}function G(e,t,n,i){var r=t.createElement("button");r.type="button",r.className="wgc-launcher",r.id="wgc-launcher",r.textContent=i||z.defaultLaunchLabel;var l=t.createElement("div");l.className="wgc-overlay",l.id="wgc-overlay";var a=t.createElement("div");a.className="wgc-modal",a.id="wgc-modal",a.setAttribute("role","dialog"),a.setAttribute("aria-modal","true"),a.setAttribute("aria-labelledby","wgc-dyn-title");var v=t.createElement("div");v.className="wgc-modal-header";var y=t.createElement("span");y.className="wgc-modal-ribbon",y.textContent=z.ribbon;var g=t.createElement("button");g.type="button",g.className="wgc-modal-close",g.id="wgc-modal-close",g.setAttribute("aria-label",z.close),g.textContent="\xD7";var x=t.createElement("div");x.className="wgc-modal-body",x.appendChild(n),v.appendChild(y),v.appendChild(g),a.appendChild(v),a.appendChild(x),l.appendChild(a);var h=!1,k=null,_="";function I(o){if(o.key==="Escape"||o.key==="Esc"){o.preventDefault(),c();return}if(o.key==="Tab"){o.preventDefault();var d=j(a);if(!d.length)return;var u=ce(d,e.activeElement,o.shiftKey);d[u].focus()}}function S(o){o.target===l&&c()}function f(){if(!h){h=!0,k=r,l.classList.add("wgc-open"),_=t.body.style.overflow,t.body.style.overflow="hidden",a.addEventListener("keydown",I),l.addEventListener("click",S);var o=j(a);(o[0]||g).focus()}}function c(){h&&(h=!1,l.classList.remove("wgc-open"),t.body.style.overflow=_,a.removeEventListener("keydown",I),l.removeEventListener("click",S),k&&typeof k.focus=="function"&&k.focus())}return r.addEventListener("click",f),g.addEventListener("click",c),{launcher:r,overlay:l,dialog:a,open:f,close:c}}var de="wgc-analysis",ue=["2","3","4","5+"],T=[{name:"name",label:"Name",type:"text",required:!0,autocomplete:"name",maxlength:120,half:!1},{name:"email",label:"Email",type:"email",required:!0,autocomplete:"email",maxlength:254,half:!1},{name:"phone",label:"Phone",type:"tel",required:!0,autocomplete:"tel",maxlength:20,half:!1},{name:"zip",label:"ZIP code",type:"text",required:!0,autocomplete:"postal-code",maxlength:5,half:!0,inputmode:"numeric"},{name:"sqft",label:"Square footage",type:"text",required:!0,maxlength:6,half:!0,inputmode:"numeric",placeholder:"approximate is fine"}];function L(e){return'<div class="wgc-field"><label class="wgc-label" for="wgc-'+e.name+'">'+s(e.label)+'</label><input class="wgc-input" id="wgc-'+e.name+'" name="'+e.name+'" type="'+e.type+'" maxlength="'+e.maxlength+'"'+(e.inputmode?' inputmode="'+e.inputmode+'"':"")+(e.placeholder?' placeholder="'+s(e.placeholder)+'"':"")+(e.autocomplete?' autocomplete="'+e.autocomplete+'"':"")+(e.required?' required aria-required="true"':"")+' aria-describedby="wgc-err-'+e.name+'"><span class="wgc-err" id="wgc-err-'+e.name+'" aria-live="polite"></span></div>'}function pe(){var e=ue.map(function(t,n){return'<button type="button" class="wgc-seg-opt" role="radio" aria-checked="false" data-value="'+s(t)+'" tabindex="'+(n===0?"0":"-1")+'">'+s(t)+"</button>"}).join("");return'<div class="wgc-field"><span class="wgc-label" id="wgc-bedrooms-label">Bedrooms (optional)</span><div class="wgc-seg" role="radiogroup" aria-labelledby="wgc-bedrooms-label" aria-describedby="wgc-err-bedrooms">'+e+'</div><span class="wgc-err" id="wgc-err-bedrooms" aria-live="polite"></span></div>'}function ge(e){var t=L(T[0])+L(T[1])+L(T[2])+'<div class="wgc-row">'+L(T[3])+L(T[4])+"</div>"+pe();return'<div class="wgc-wrap"><h2 class="wgc-title" id="wgc-dyn-title">Free Rental Analysis</h2><p class="wgc-sub">Tell us about your property and the Westrom team will prepare your analysis.</p><p class="wgc-status" id="wgc-status" role="status" aria-live="polite"></p><form id="wgc-form" novalidate>'+t+'<div class="wgc-check"><input type="checkbox" id="wgc-ebook" name="ebook_opt_in"><label for="wgc-ebook">'+s(m.ebookLabel)+'</label></div><div class="wgc-hp" aria-hidden="true"><label for="wgc-fax">Fax number</label><input id="wgc-fax" name="fax" type="text" tabindex="-1" autocomplete="off"></div><button class="wgc-btn" type="submit" id="wgc-submit">Get My Free Analysis</button><p class="wgc-fineprint">'+s(m.finePrint)+'</p><a class="wgc-privacy wgc-link" href="'+s(e.privacyUrl)+'" target="_blank" rel="noopener">Privacy Policy</a></form></div>'}function fe(e){return'<div class="wgc-wrap"><div class="wgc-panel" role="alert" aria-live="assertive"><h2 class="wgc-title" id="wgc-dyn-title">Something went wrong</h2><p class="wgc-sub">Your request was not sent. Please try again, or use our <a class="wgc-link" href="'+s(e.fallbackUrl)+'">rental analysis page</a>.</p><button class="wgc-btn" id="wgc-retry" type="button">Try again</button></div></div>'}function me(e){var t=e.getAttribute("data-endpoint")||N,n=(e.getAttribute("data-mode")||"inline").toLowerCase();return{endpoint:t.replace(/\/+$/,""),source:e.getAttribute("data-source")||"Website - wgcassetguide",privacyUrl:e.getAttribute("data-privacy-url")||"https://wgcassetguide.com/privacy",fallbackUrl:e.getAttribute("data-fallback-url")||"https://wgcassetguide.com/analysis",mode:n==="popup"?"popup":"inline",launchLabel:e.getAttribute("data-launch-label")||null}}function be(e,t,n){var i={source:t.source,submission_id:n};e.dispatchEvent(new CustomEvent("wgc-lead-submitted",{bubbles:!0,composed:!0,detail:i})),window.dispatchEvent(new CustomEvent("wgc-lead-submitted",{detail:i})),Array.isArray(window.dataLayer)&&window.dataLayer.push({event:"wgc_lead_submitted",source:t.source,submission_id:n})}function W(e,t){var n=null;["name","email","phone","zip","sqft","bedrooms"].forEach(function(i){var r=e.querySelector('[name="'+i+'"]'),l=e.getElementById("wgc-err-"+i),a=t[i]||"";l&&(l.textContent=a),r&&r.setAttribute("aria-invalid",a?"true":"false"),a&&!n&&(n=r||e.querySelector(".wgc-seg [data-value]"))}),n&&typeof n.focus=="function"&&n.focus()}function Y(e){if(!e)return;var t=me(e),n=document.getElementById(de);if(!n||n.shadowRoot)return;var i=Date.now(),r=n.attachShadow({mode:"open"}),l=document.createElement("style");l.textContent=O;var a=document.createElement("div");if(r.appendChild(l),t.mode==="popup"){var v=G(r,document,a,t.launchLabel);r.appendChild(v.launcher),r.appendChild(v.overlay)}else r.appendChild(a);var y=M(t.endpoint);y.refresh().catch(function(){});var g=null,x="",h=!1;function k(f){var c=f.querySelector(".wgc-seg");if(!c)return;var o=Array.prototype.slice.call(c.querySelectorAll("[data-value]"));function d(u){x=u.getAttribute("data-value"),o.forEach(function(w){var p=w===u;w.setAttribute("aria-checked",p?"true":"false"),w.setAttribute("tabindex",p?"0":"-1")})}o.forEach(function(u,w){u.addEventListener("click",function(){d(u),u.focus()}),u.addEventListener("keydown",function(p){var b=-1;if(p.key==="ArrowRight"||p.key==="ArrowDown")b=(w+1)%o.length;else if(p.key==="ArrowLeft"||p.key==="ArrowUp")b=(w-1+o.length)%o.length;else if(p.key==="Home")b=0;else if(p.key==="End")b=o.length-1;else if(p.key===" "||p.key==="Enter"){p.preventDefault(),d(u);return}b>=0&&(p.preventDefault(),d(o[b]),o[b].focus())})})}function _(f){function c(o){var d=f.querySelector('[name="'+o+'"]');return d?d.value:""}return{name:c("name"),email:c("email"),phone:c("phone"),zip:c("zip"),sqft:c("sqft"),bedrooms:x}}function I(f,c){a.innerHTML='<div class="wgc-wrap">'+U(f,{ebookOptIn:c})+"</div>";var o=r.getElementById("wgc-cta");o&&o.addEventListener("click",function(){var d=r.getElementById("wgc-thanks");d&&d.removeAttribute("hidden"),o.setAttribute("hidden",""),d&&d.focus()})}function S(){a.innerHTML=ge(t);var f=r.getElementById("wgc-form"),c=r.getElementById("wgc-submit"),o=r.getElementById("wgc-status");k(f),f.addEventListener("focusin",function(){y.ensureFresh()}),f.addEventListener("submit",function(d){if(d.preventDefault(),!h){var u=B(_(f));if(!u.ok){W(r,u.errors),o.textContent="Please fix the highlighted fields.",o.setAttribute("data-kind","error");return}W(r,{});var w=r.getElementById("wgc-ebook").checked;u.data.ebook_opt_in=w,g||(g=R());var p=H(u.data,{submissionId:g}),b={token:y.get()||"",honeypot:r.getElementById("wgc-fax").value,fillMs:Date.now()-i};h=!0,c.disabled=!0,o.removeAttribute("data-kind"),o.textContent="Sending your request\u2026",y.ensureFresh().then(function(E){return b.token=E||"",F(t.endpoint,p,b)}).then(function(E){I(E,w),be(n,t,g)}).catch(function(){h=!1,a.innerHTML=fe(t);var E=r.getElementById("wgc-retry");E&&E.addEventListener("click",function(){h=!1,S()})})}})}S()}var Z=document.currentScript;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",function(){Y(Z)}):Y(Z);})();
