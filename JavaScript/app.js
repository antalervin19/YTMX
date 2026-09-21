import red from "../reduction/reduction.js"

red.views = {
    home: {
        path: "./AppPages/home.html"
    }
};

red.reload();
red.switch("home");