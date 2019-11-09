@rem I've made initial branch setup using this guide:
@rem https://drewsilcock.co.uk/custom-jekyll-plugins see end of this file for its saved copy, just in case it goes offline
@rem Commit message should be put in double quotes

call bundle exec jekyll build --future && ^
git add . && ^
git commit -m %1 && ^
git push origin source && ^
cd _site && ^
git add . && ^
git commit -m %1 && ^
git push origin master -f

cd %~dp0



@rem ---
@rem title: Custom Jekyll plugins with GitHub Pages
@rem layout: post
@rem permalink: custom-jekyll-plugins
@rem comments: True
@rem categories: Coding
@rem ---
@rem 
@rem So GitHub Pages is a fantastic resource for hosting your personal or organisation site on GitHub, for free. It even supports Jekyll! only thing is, it doesn't support custom plugins because of the `--safe` flag that it compiles your site with. So what do you do?
@rem 
@rem Well, if you compile the site using `jekyll` yourself, then push the resulting compiled HTML to your GitHub Pages repository, then it works perfectly! You get your custom plugins, and you get your free GitHub Pages hosting.
@rem 
@rem So how do you organise the source and compiled code?
@rem 
@rem <!--more-->
@rem 
@rem Some people, like [Charlie Park](http://charliepark.org/jekyll-with-plugins/), recommend two repos, one with the source code (e.g. `github.com/username/username.github.io.raw` for the website source code and `github.com/username/username.github.io` for the compiled HTML). I don't particularly like this; it's one project, it should be one repo.
@rem 
@rem Others, like [Alexandre Rademaker](http://arademaker.github.io/blog/2011/12/01/github-pages-jekyll-plugins.html), have two separate branches (a `master` for compiled HTML and a `source` for the Jekyll source), and change branches then copy the contents of `_site` into the master branch every time you want to push to your website.
@rem 
@rem I like the idea of separate branches within the same repo, but messing about with copying `_site` seems laborious and unnecessary. Here's my solution:
@rem 
@rem Two branches: source and master.
@rem 
@rem Master contains compiled HTML, source contains the Jekyll source.
@rem 
@rem In the `.gitignore` of the `source` branch, you put the following:
@rem 
@rem {% highlight bash lineanchors %}
@rem _site
@rem {% endhighlight %}
@rem 
@rem Then, when you run `jekyll build` and Jekyll produces all the HTML in `_site`, git doesn't recognise it. That means that we can `cd` into `_site`, and seeing as git doesn't know the difference, we can make `_site` itself into its own git repository.
@rem 
@rem Assuming you're starting off with a bog standard single branch Pages repo, you run:
@rem {% highlight bash lineanchors %}
@rem # Make sure _site is empty before we begin
@rem rm -rf _site/*
@rem 
@rem # Make new source branch
@rem git checkout -b source
@rem 
@rem # Tell Jekyll to ignore this dir
@rem touch .nojekyll
@rem 
@rem # Tell git to track source remote branch
@rem git branch --set-upstream source origin/source
@rem 
@rem # Upload your branch to GitHub
@rem git push origin source
@rem 
@rem # Locally delete the original master branch
@rem git branch -D master
@rem 
@rem # Make a new git repository within _site
@rem cd _site
@rem git init
@rem 
@rem # Tell Jekyll to ignore this directory
@rem touch .nojekyll
@rem 
@rem # Set the remote repository to push the HTML to
@rem git remote add origin https://github.com/username/username.github.io
@rem 
@rem # Tell it to push to the master remote branch
@rem git branch --set-upstream master origin/master
@rem {% endhighlight %}
@rem 
@rem Now you've got your source branch set up in your root directory and master branch set up in your `_site` directory, ready for rapid building and deployment of your Jekyll website.
@rem 
@rem Now each time you want to build your site locally, you just need to run:
@rem {% highlight bash lineanchors %}
@rem jekyll build
@rem cd _site
@rem git add .
@rem git commit
@rem git push origin master
@rem {% endhighlight %}
@rem and you have successfully built and deployed your website with Jekyll. Note that by default Jekyll does not copy `.nojekyll` over to `_site` where we need it, because it is a dotfile, so you need to put the following in your `_config.yml`:
@rem 
@rem {% highlight yaml lineanchors %}
@rem include: .nojekyll
@rem {% endhighlight %}
@rem 
@rem Now, to automate this process, I wrote a small bash script to build, commit and push your site all in one command. Here is the [gist of it](https://gist.github.com/drewsberry/1b9fc80682edd8bcecc4), and this is the script:
@rem 
@rem {% highlight bash lineanchors %}
@rem #!/bin/bash
@rem  
@rem if [[ -z "$1" ]]; then
@rem   echo "Please enter a git commit message"
@rem   exit
@rem fi
@rem  
@rem jekyll build && \
@rem   cd _site && \
@rem   git add . && \
@rem   git commit -am "$1" && \
@rem   git push origin master && \
@rem   cd .. && \
@rem   echo "Successfully built and pushed to GitHub."
@rem {% endhighlight %}
@rem 
@rem So if I wanted to build my site locally and push it to my repository with the commit message "Latest build", I would run:
@rem 
@rem {% highlight bash lineanchors %}
@rem jekgit.sh "Latest build"
@rem {% endhighlight %}
@rem 