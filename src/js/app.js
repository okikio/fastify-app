import swup from "swup";
import el from "./components/ele";
import { _log } from "./components/util";
// import './components/smoothstate';
// import _class from "./components/class";
// import _event from "./components/event";
// import scrollPlugin from "@swup/scroll-plugin";

import preload from '@swup/preload-plugin';
let _load = () => {
   let ele = el(`<a class='name'>Hello</a>`);
   ele.prependTo("#swup");
   ele.on("click", function () {
      _log(this);
      el(this).animate({
         direction: 'alternate',
         color: ["#008000", "#00eeaa"],
         translateX: [0, 250]
      });
   });

   el('.navbar-menu').click(function (e) {
      e.preventDefault();
      _log("Nabar-menu");
      el('.navbar').toggleClass("navbar-show");
  });

   el('main').find(`a.name`).on("click mouseenter", () => { _log(`Link - Hover/Clicked`); });
};

_load();

if (window._isModern) {
   let trans = new swup({
      requestHeaders: {
         "X-Requested-With": "swup", // So we can tell request comes from swup
         "x-partial": "swup" // Request a partial html page
      },
      plugins: [new preload()]
   });


   // this event runs for every page view after initial load
   trans.on('contentReplaced', _load);
}