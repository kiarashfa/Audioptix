// analytics.js
// The one and only place the Google Analytics measurement ID lives.
// Pages load this with a plain <script async src="analytics.js"></script>, so
// changing the property is a one-line edit here no matter how many pages exist.
//
// The measurement ID is public by design: it is visible in any page's network
// traffic. Unlike a real secret it belongs in committed source, not in .env.

const GA_ID = 'G-9KKBGMGBVE';

const s = document.createElement('script');
s.async = true;
s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
document.head.appendChild(s);

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', GA_ID);
