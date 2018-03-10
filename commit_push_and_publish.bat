@rem I've made initial branch setup using this guide:
@rem https://drewsilcock.co.uk/custom-jekyll-plugins

call jekyll build --future && ^
git add . && ^
git commit -m "%1"

