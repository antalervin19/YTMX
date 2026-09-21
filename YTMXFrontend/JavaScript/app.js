import red from "../reduction/reduction.js"

red.views = {
    home: {
        path: "./AppPages/Home.html"
    },
    library: {
        path: "./AppPages/Library.html"
    },
    search: {
        path: "./AppPages/Search.html"
    },
    "group-jam": {
        path: "./AppPages/GroupJam.html"
    }
};

red.reload();
red.switch("home");