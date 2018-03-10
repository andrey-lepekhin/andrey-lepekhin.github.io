@rem I've made initial branch setup using this guide:
@rem https://drewsilcock.co.uk/custom-jekyll-plugins

call jekyll build --future && ^
git add . && ^
git commit -m "%1" && ^
git push origin source && ^
cd _site && ^
git add . && ^
git commit -m "%1" && ^
git push origin master

cd %~dp0