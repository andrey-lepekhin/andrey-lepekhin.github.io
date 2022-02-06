---
layout: post
title: 'Dark mode implementation for this blog'
categories: blog
tags: process
excerpt_separator: <!--excerpt_separator-->
---

I’ve implemented the dark theme for this blog. An endeavour for 2-3 hours that has visible results. A satisfying project, I invite everyone with a light-theme-only blog to try.
<!--excerpt_separator-->

![An article screenshot, one half of which is in light mode and the other half is in dark mode]({{ "/images/2022-02-06-Dark-mode-implementation-for-this-blog--dark-mode-example-picture.jpg" | absolute_url }})

_CSS Tricks_, of course, has this topic thoroughly covered in their [Complete Guide to Dark Mode on the Web](https://css-tricks.com/a-complete-guide-to-dark-mode-on-the-web/). I'll describe what I've done in this particular blog and why.

I’m using `@media (prefers-color-scheme: dark) { ... }` CSS media query which lets me use OS-level user preferences. I chose not to support manual toggling between modes because of two reasons:
1. Implementation involves JavaScript swapping CSS classes and storing state in Local Storage–a harder effort than I wanted for this quick-win project
1. If a user has strong preferences about the dark mode, I imagine such a user already has a way of controlling the interface. Such as a browser plugin that changes the theme, e.g. [Dark Reader](https://darkreader.org/). 

As dark mode gains momentum, I think major browsers will display a toggle between modes (not only in Dev Tools) making the effort of creating this toggle myself moot.

## Implementation

This blog uses a modified [Pixyll theme](https://github.com/johno/pixyll) that has **32** SASS files that get compiled into one big CSS file.

![Part of includes listing @importing separate SASS files for links, code, header, etc]({{ "/images/2022-02-06-Dark-mode-implementation-for-this-blog--sass-includes-listing.jpg" | absolute_url }}){: width="350" }

This otherwise reasonable divide-and-conquer approach bites me in the ass here, as I needed to insert the media-query block 17 times. For each style, I wanted to look different when dark. Here’s [the actual commit](https://github.com/andrey-lepekhin/andrey-lepekhin.github.io/commit/b54227499b737f5042d151f60c39416e88c9ba4b).

I could instead place all dark mode styles in one such file, but then I’ll lose the handy separation these files provide. Also, in the future, if I change a light mode style, the proximity of the corresponding dark mode style will remind me to change it as well. Something I might otherwise forget to do and test for.
If there is a better way, please tell me about it.

So, that's basically it: adding media-query styles and selecting particular colors that look good on dark background.

-----

Oh, while we’re on a technical topic, I want to boast a little. This site got a 100/100 performance score at Google’s [PageSpeed Insights](https://pagespeed.web.dev) for desktop and 97 for mobile. I can mostly attribute it to Jekyll itself and a little bit to my tweaks using locally hosted fonts instead of Google Fonts' CDN. I host this blog on [GitHub Pages](https://pages.github.com/) for free, you can use the [same GitHub Pages-friendly process](https://github.com/barryclark/jekyll-now) I'm using.