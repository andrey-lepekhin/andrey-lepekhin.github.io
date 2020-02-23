---
layout: post
title: "Some programming idioms explained"
categories: links
---


[The Zen of Go](https://dave.cheney.net/2020/02/23/the-zen-of-go) by _Dave Cheney_

As a perpetually novice programmer, it was nice to see the reasons behind some popular idioms explained. Like why "Maintainability counts" or "Avoid package level state".
Also this way of seeing developer work as preparation for inevitable change:

> Change is the name of the game we’re in. What we do as programmers is manage change. When we do that well we call it design, or architecture. When we do it badly we call it technical debt, or legacy code.  
>
> If you are writing a program that works perfectly, one time, for one fixed set of inputs then nobody cares if the code is good or bad because ultimately the output of the program is all the business cares about. 
> 
> But this is never true. Software has bugs, requirements change, inputs change, and very few programs are written solely to be executed once, thus your program will change over time. Maybe it’s you who’ll be tasked with this, more likely it will be someone else, but someone has to change that code. Someone has to maintain that code.