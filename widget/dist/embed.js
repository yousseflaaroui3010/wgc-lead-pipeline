(()=>{var b=`/* Compiled into the open shadow root (TD-1). System font stack only:
   @font-face does not apply inside shadow roots (PRD NFR-Performance). */

:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1a1a1a;
  line-height: 1.45;
}

.wgc-wrap {
  box-sizing: border-box;
  min-height: 560px; /* reserved height: no layout shift on load (NFR) */
  max-width: 480px;
  padding: 20px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #ffffff;
}

.wgc-wrap *,
.wgc-wrap *::before,
.wgc-wrap *::after {
  box-sizing: border-box;
  font-family: inherit;
}

.wgc-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}

.wgc-sub {
  margin: 0 0 16px;
  font-size: 14px;
  color: #444444;
}

.wgc-field {
  margin-bottom: 12px;
}

.wgc-row {
  display: flex;
  gap: 12px;
}

.wgc-row .wgc-field {
  flex: 1 1 0;
  min-width: 0;
}

.wgc-label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}

.wgc-input,
.wgc-textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 16px; /* >=16px stops iOS Safari zoom-on-focus */
  border: 1px solid #8c8c8c;
  border-radius: 6px;
  background: #ffffff;
  color: #1a1a1a;
}

.wgc-textarea {
  min-height: 72px;
  resize: vertical;
}

.wgc-input:focus,
.wgc-textarea:focus,
.wgc-check input:focus,
.wgc-btn:focus,
.wgc-link:focus {
  outline: 3px solid #1a56b0;
  outline-offset: 1px;
}

.wgc-input[aria-invalid="true"],
.wgc-textarea[aria-invalid="true"] {
  border-color: #b3261e;
}

.wgc-err {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: #b3261e;
  min-height: 1em;
}

.wgc-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 14px 0;
}

.wgc-check input {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
}

.wgc-check label {
  font-size: 12px;
  color: #333333;
}

.wgc-btn {
  display: block;
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
  background: #1a56b0;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.wgc-btn[disabled] {
  background: #7a95bd;
  cursor: default;
}

.wgc-privacy {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  text-align: center;
}

.wgc-link {
  color: #1a56b0;
}

.wgc-status {
  margin: 0 0 12px;
  font-size: 14px;
}

.wgc-status[data-kind="error"] {
  color: #b3261e;
}

.wgc-panel {
  min-height: 520px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

/* Honeypot: visually removed but still in the DOM for naive bots.
   display:none is deliberately avoided (some bots skip hidden fields). */
.wgc-hp {
  position: absolute !important;
  left: -9999px !important;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
`;var B=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,s={first_name:{min:1,max:60},last_name:{min:1,max:60},email:{max:254},property_address:{min:5,max:120},message:{max:1e3},beds:{min:0,max:20},baths:{min:0,max:20,step:.5}};function w(t){let e=String(t==null?"":t).trim();return e.length<s.first_name.min||e.length>s.first_name.max?null:e}function F(t){let e=String(t==null?"":t).trim();return e.length>s.email.max||!B.test(e)?null:e}function D(t){let e=String(t==null?"":t).trim(),a=e.replace(/\D/g,"");return e.startsWith("+")&&!e.startsWith("+1")?null:e.startsWith("+")?a.length===11?"+"+a:null:a.length===10?"+1"+a:a.length===11&&a[0]==="1"?"+"+a:null}function L(t){let e=String(t==null?"":t).trim(),{min:a,max:n}=s.property_address;return e.length<a||e.length>n?null:e}function P(t){let e=String(t==null?"":t).trim();if(e==="")return null;let a=Number(e);if(!(!Number.isInteger(a)||a<s.beds.min||a>s.beds.max))return a}function q(t){let e=String(t==null?"":t).trim();if(e==="")return null;let a=Number(e);if(!(Number.isNaN(a)||a<s.baths.min||a>s.baths.max)&&Math.round(a*2)===a*2)return a}function z(t){let e=String(t==null?"":t).trim();if(!(e.length>s.message.max))return e===""?null:e}function y(t){let e={},a={};return a.first_name=w(t.first_name),a.first_name===null&&(e.first_name="Enter your first name (1\u201360 characters)."),a.last_name=w(t.last_name),a.last_name===null&&(e.last_name="Enter your last name (1\u201360 characters)."),a.email=F(t.email),a.email===null&&(e.email="Enter a valid email address."),a.phone=D(t.phone),a.phone===null&&(e.phone="Enter a valid US phone number (10 digits)."),a.property_address=L(t.property_address),a.property_address===null&&(e.property_address="Enter the property address (5\u2013120 characters)."),a.beds=P(t.beds),a.beds===void 0&&(e.beds="Beds must be a whole number from 0 to 20."),a.baths=q(t.baths),a.baths===void 0&&(e.baths="Baths must be between 0 and 20 in half steps."),a.message=z(t.message),a.message===void 0&&(e.message="Message must be 1,000 characters or fewer."),Object.keys(e).length?{ok:!1,errors:e}:{ok:!0,data:a}}var H="WGC-TCPA-2026-07-v1";function x(t,e){let a=new AbortController,n=setTimeout(function(){a.abort()},1e4),i=Object.assign({},e,{signal:a.signal});return fetch(t,i).finally(function(){clearTimeout(n)})}function v(t){let e=null,a=0;function n(){return x(t+"/token",{method:"GET"}).then(function(r){if(!r.ok)throw new Error("token fetch failed: "+r.status);return r.text()}).then(function(r){return e=r.trim(),a=Date.now(),e})}function i(){return e&&Date.now()-a<36e5?Promise.resolve(e):n().catch(function(){return e})}return{refresh:n,ensureFresh:i,get:function(){return e}}}function _(){if(typeof crypto.randomUUID=="function")return crypto.randomUUID();let t=crypto.getRandomValues(new Uint8Array(16));t[6]=t[6]&15|64,t[8]=t[8]&63|128;let e=Array.prototype.map.call(t,function(a){return(a+256).toString(16).slice(1)}).join("");return e.slice(0,8)+"-"+e.slice(8,12)+"-"+e.slice(12,16)+"-"+e.slice(16,20)+"-"+e.slice(20)}function E(t){let e=new URLSearchParams(t||"");return{source:e.get("utm_source")||"",medium:e.get("utm_medium")||"",campaign:e.get("utm_campaign")||""}}function k(t,e){return{schema_version:"1.0",submission_id:e.submissionId,first_name:t.first_name,last_name:t.last_name,email:t.email,phone:t.phone,property_address:t.property_address,beds:t.beds,baths:t.baths,message:t.message,source:e.source,page_url:e.pageUrl,utm:e.utm,consent:{tcpa:t.tcpa===!0,timestamp:new Date().toISOString(),text_version:H}}}function S(t,e,a,n){let i=Object.assign({},e,{token:a,company:n||""});return x(t+"/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(i)}).then(function(r){if(!r.ok)throw new Error("submit failed: "+r.status);return!0})}var W="wgc-analysis",j="By clicking submit, I agree to receive calls and text messages from Westrom Group at the number provided. Consent is not a condition of any purchase or service. Message and data rates may apply.",l=[{name:"first_name",label:"First name",type:"text",required:!0,autocomplete:"given-name",maxlength:60},{name:"last_name",label:"Last name",type:"text",required:!0,autocomplete:"family-name",maxlength:60},{name:"email",label:"Email",type:"email",required:!0,autocomplete:"email",maxlength:254},{name:"phone",label:"Phone",type:"tel",required:!0,autocomplete:"tel",maxlength:20},{name:"property_address",label:"Property address",type:"text",required:!0,autocomplete:"street-address",maxlength:120},{name:"beds",label:"Beds (optional)",type:"number",required:!1,maxlength:2},{name:"baths",label:"Baths (optional)",type:"number",required:!1,maxlength:4}];function c(t){var e=t.name==="beds"||t.name==="baths";return'<div class="wgc-field" data-half="'+e+'"><label class="wgc-label" for="wgc-'+t.name+'">'+t.label+'</label><input class="wgc-input" id="wgc-'+t.name+'" name="'+t.name+'" type="'+t.type+'" maxlength="'+t.maxlength+'"'+(t.autocomplete?' autocomplete="'+t.autocomplete+'"':"")+(t.required?' required aria-required="true"':"")+(t.name==="baths"?' step="0.5" min="0" max="20"':"")+(t.name==="beds"?' step="1" min="0" max="20"':"")+' aria-describedby="wgc-err-'+t.name+'"><span class="wgc-err" id="wgc-err-'+t.name+'" aria-live="polite"></span></div>'}function G(t){var e='<div class="wgc-row">'+c(l[0])+c(l[1])+"</div>"+c(l[2])+c(l[3])+c(l[4])+'<div class="wgc-row">'+c(l[5])+c(l[6])+"</div>";return'<div class="wgc-wrap"><h2 class="wgc-title">Free Rental Analysis</h2><p class="wgc-sub">Tell us about your property and the Westrom team will prepare your analysis.</p><p class="wgc-status" id="wgc-status" role="status" aria-live="polite"></p><form id="wgc-form" novalidate>'+e+'<div class="wgc-field"><label class="wgc-label" for="wgc-message">Message (optional)</label><textarea class="wgc-textarea" id="wgc-message" name="message" maxlength="1000" aria-describedby="wgc-err-message"></textarea><span class="wgc-err" id="wgc-err-message" aria-live="polite"></span></div><div class="wgc-hp" aria-hidden="true"><label for="wgc-company">Company</label><input id="wgc-company" name="company" type="text" tabindex="-1" autocomplete="off"></div><div class="wgc-check"><input type="checkbox" id="wgc-tcpa" name="tcpa"><label for="wgc-tcpa">'+j+'</label></div><button class="wgc-btn" type="submit" id="wgc-submit">Get My Free Analysis</button><a class="wgc-privacy wgc-link" href="'+t.privacyUrl+'" target="_blank" rel="noopener">Privacy Policy</a></form></div>'}function T(t,e,a){return'<div class="wgc-wrap"><div class="wgc-panel" role="status" aria-live="assertive"><h2 class="wgc-title">'+t+'</h2><p class="wgc-sub">'+e+"</p>"+(a?'<button class="wgc-btn" id="wgc-retry" type="button">Try again</button>':"")+"</div></div>"}function V(t){var e=t.getAttribute("data-endpoint")||"https://wgcassetguide.com/hook";return{endpoint:e.replace(/\/+$/,""),source:t.getAttribute("data-source")||"Website - wgcassetguide",privacyUrl:t.getAttribute("data-privacy-url")||"https://wgcassetguide.com/privacy",slaDays:t.getAttribute("data-sla-days")||"",fallbackUrl:t.getAttribute("data-fallback-url")||"https://wgcassetguide.com/analysis"}}function K(t){var e=t.slaDays?"expect it within "+t.slaDays+" business days.":"we will be in touch shortly.";return"Your analysis will be prepared by the Westrom team &mdash; "+e}function X(t,e,a){var n={source:e.source,submission_id:a},i=new CustomEvent("wgc-lead-submitted",{bubbles:!0,composed:!0,detail:n});t.dispatchEvent(i),window.dispatchEvent(new CustomEvent("wgc-lead-submitted",{detail:n})),Array.isArray(window.dataLayer)&&window.dataLayer.push({event:"wgc_lead_submitted",source:e.source,submission_id:a})}function Y(t){function e(a){var n=t.querySelector('[name="'+a+'"]');return n?n.value:""}return{first_name:e("first_name"),last_name:e("last_name"),email:e("email"),phone:e("phone"),property_address:e("property_address"),beds:e("beds"),baths:e("baths"),message:e("message")}}function I(t,e){var a=null;["first_name","last_name","email","phone","property_address","beds","baths","message"].forEach(function(n){var i=t.querySelector('[name="'+n+'"]'),r=t.getElementById("wgc-err-"+n),o=e[n]||"";r&&(r.textContent=o),i&&i.setAttribute("aria-invalid",o?"true":"false"),o&&!a&&(a=i)}),a&&a.focus()}function A(t){if(!t)return;var e=V(t),a=document.getElementById(W);if(!a||a.shadowRoot)return;var n=a.attachShadow({mode:"open"}),i=document.createElement("style");i.textContent=b;var r=document.createElement("div");n.appendChild(i),n.appendChild(r);var o=v(e.endpoint);o.refresh().catch(function(){});var u=null,d=!1;function h(){r.innerHTML=G(e);var f=n.getElementById("wgc-form"),M=n.getElementById("wgc-submit"),m=n.getElementById("wgc-status");f.addEventListener("focusin",function(){o.ensureFresh()}),f.addEventListener("submit",function(N){if(N.preventDefault(),!d){var p=y(Y(f));if(!p.ok){I(n,p.errors),m.textContent="Please fix the highlighted fields.",m.setAttribute("data-kind","error");return}I(n,{}),p.data.tcpa=n.getElementById("wgc-tcpa").checked,u||(u=_());var U=k(p.data,{submissionId:u,source:e.source,pageUrl:window.location.href,utm:E(window.location.search)}),O=n.getElementById("wgc-company").value;d=!0,M.disabled=!0,m.removeAttribute("data-kind"),m.textContent="Sending your request\u2026",o.ensureFresh().then(function(g){return S(e.endpoint,U,g||"",O)}).then(function(){r.innerHTML=T("Request received",K(e),!1),X(a,e,u)}).catch(function(){d=!1,r.innerHTML=T("Something went wrong",'Your request was not sent. Please try again, or use our <a class="wgc-link" href="'+e.fallbackUrl+'">rental analysis page</a>.',!0);var g=n.getElementById("wgc-retry");g&&g.addEventListener("click",function(){d=!1,h()})})}})}h()}var C=document.currentScript;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",function(){A(C)}):A(C);})();
