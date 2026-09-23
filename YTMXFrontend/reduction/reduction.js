// reduction.js
// Copyright (c) 2026 Patrik Szabó

const internal = {
    log: (message) => {
        console.log(`[reduction.js] ${message}`);
    },
    exception: (message) => {
        console.error(`[reduction.js] An exception occoured: ${message}`);
        if (red.config.fatalExceptions) {
            internal.fatalException(`A regular exception has been raised up, because fatalExceptions is set to true.\nOriginal message: ${message}`)
        }
    },
    fatalException: (message) => {
        console.error(`[reduction.js] A fatal exception occoured: ${message}`);
        const dialog = document.createElement("dialog");
        dialog.style.backgroundColor = "#cacaca";
        dialog.style.padding = "10px";
        dialog.style.margin = "auto";
        dialog.innerHTML = `
            <h2>A fatal exception occoured:</h2>
            <p>"${message}"</p>
            <br>
            <p>For more information, check the console and refer to the documentation.</p>
            <br>
            <form method="dialog">
                <button type="submit">Close</button>
            </form>
        `;
        document.body.appendChild(dialog);
        dialog.showModal();
    },
    randgen: () => {
        return (Math.random() + 1).toString(36).substring(7);
    },
    indexedViews: [],
    loadedViews: {}, // indexedViewName: DOMIdentifier
    onViewLoadFunction: () => {},
    onViewSwitchFunction: () => {},
    viewScriptRunOnceMap: {},
    viewScriptRunWhenSwitchedMap: {},
    switches: new Set(),
    accessView: async (indexedViewName, viewObject) => {
        internal.log(`Accessing ${viewObject.name} (${indexedViewName}) at ${viewObject.path}`);
        
        try {
            const response = await fetch(viewObject.path);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.text();
        } catch (error) {
            internal.exception(`Failed to load "${indexedViewName}" from ${viewObject.path}: ${error.message}`);
            return `<p>An error occoured while trying to load view: ${error.message}</p>`;
        }
    },
    loadView: async (indexedViewName, viewObject) => {
        const pageHTML = await internal.accessView(indexedViewName, viewObject);
        const DOMIdentifier = indexedViewName + "-" + internal.randgen();

        internal.log(`Pushing ${indexedViewName} into loadedViews`);
        internal.loadedViews[indexedViewName] = DOMIdentifier;

        internal.log(`Creating container Element for ${indexedViewName}`);
        const viewContainer = document.createElement("div");
        viewContainer.id = DOMIdentifier;
        viewContainer.classList.add("red-viewcontainer");
        viewContainer.style.display = "none";
        viewContainer.innerHTML = pageHTML;

        internal.log(`Pushing ${indexedViewName} into DOM with DOMIdentifier ${DOMIdentifier}`);
        red.root.appendChild(viewContainer);

        internal.onViewLoadFunction();
        if (indexedViewName in internal.viewScriptRunOnceMap) {
            internal.viewScriptRunOnceMap[indexedViewName]();
        }

        // Temporary implementation
        document.querySelectorAll("[red-switch]").forEach(element => {
            if (internal.switches.has(element)) return;
            internal.switches.add(element);
            internal.log("Adding event listener to " + element.innerHTML);
            element.addEventListener(red.config.switchActivationEvent, () => {
                red.switch(element.getAttribute("red-switch"));
            });
        });

        return DOMIdentifier;
    },
    elementScanner: () => {
        // Finding root element
        if (!red.root) {
            internal.log("Querying root element");
            const rootElement = document.querySelector("[red-root]");
            if (!rootElement) internal.fatalException("Root element cannot be found and is not set");
            red.root = rootElement;
        } else {
            internal.log("Root element explicitly set. Not searching");
        }

        // Finding switches
        document.querySelectorAll("[red-switch]").forEach(element => {
            if (internal.switches.has(element)) return;
            internal.switches.add(element);
            element.addEventListener(red.config.switchActivationEvent, () => {
                red.switch(element.getAttribute("red-switch"));
            });
        });
    },
    viewIndexer: () => {
        internal.log(`Clearing indexedViews (previously held ${internal.indexedViews.length} views)`);
        internal.indexedViews = [];
        for (const [indexableViewName, viewObject] of Object.entries(red.views)) {
            internal.log(`viewIndexer: Indexing "${indexableViewName}"`);

            // Defaults
            if (!("name" in viewObject)) red.views[indexableViewName].name = indexableViewName;
            if (!("description" in viewObject)) red.views[indexableViewName].description = "";
            if (!("preload" in viewObject)) red.views[indexableViewName].preload = false;
            if (!("keepInDOM" in viewObject)) red.views[indexableViewName].keepInDOM = true;
            if (!("path" in viewObject)) {
                internal.exception(`Cannot index ${indexableViewName}: A path is not present. Skipping it`);
                continue;
            }

            internal.indexedViews.push(indexableViewName);

            if (viewObject.preload) {
                internal.log(`viewIndexer: Asynchronously loading "${indexableViewName}"`);
                internal.loadView(indexableViewName, viewObject);
            }
        }
    }
}

const red = {
    root: null,
    views: {},
    activeView: "",
    activeViewObject: null,
    previouslyActiveView: "",
    config: {
        fatalExceptions: false,
        displayDebugOnException: false,
        switchActivationEvent: "click"
    },
    reload: (clean = false) => {
        internal.log("Running setup");
        internal.elementScanner();
        internal.viewIndexer();
    },
    load: (indexedViewName) => {
        internal.log(`Forcefully loading "${indexedViewName}" into DOM...`);
        internal.loadView(indexedViewName);
    },
    switch: async (indexedViewName) => {
        if (red.activeView === indexedViewName) return;

        if (!internal.indexedViews.includes(indexedViewName)) {
            internal.exception(`Tried to request a non-existent or not indexed page "${indexedViewName}"`);
            return;
        }

        let DOMIdentifier;
        if (!(indexedViewName in internal.loadedViews)) {
            internal.log(`"${indexedViewName}" is not yet loaded into the DOM, loading it now`);
            DOMIdentifier = await internal.loadView(indexedViewName, red.views[indexedViewName]);
        } else {
            internal.log(`"${indexedViewName}" is already loaded into the DOM`);
            DOMIdentifier = internal.loadedViews[indexedViewName];
        }

        if (red.activeView) {
            if (red.views[red.activeView].keepInDOM) {
                internal.log(`Unloading (hiding) "${red.activeView}" (currently active view)`);
                red.activeViewObject.style.display = "none";
            } else {
                internal.log(`Unloading (removing) "${red.activeView}" (currently active view)`);
                red.activeViewObject.remove();
                delete internal.loadedViews[red.activeView];
            }
        }

        const newActiveViewObject = document.getElementById(DOMIdentifier);
        
        internal.log(`Revealing "${indexedViewName}"`);
        newActiveViewObject.style.removeProperty("display");
        red.previouslyActiveView = red.activeView;
        red.activeView = indexedViewName;
        red.activeViewObject = newActiveViewObject;

        internal.onViewSwitchFunction();
        if (indexedViewName in internal.viewScriptRunWhenSwitchedMap) {
            internal.viewScriptRunWhenSwitchedMap[indexedViewName]();
        }
    },
    onViewLoad: (func) => {
        internal.onViewLoadFunction = func;
    },
    onViewSwitch: (func) => {
        internal.onViewSwitchFunction = func;
    },
    runWhenLoaded: (indexedViewName, func) => {
        internal.viewScriptRunOnceMap[indexedViewName] = func;
    },
    runWhenSwitched: (indexedViewName, func) => {
        internal.viewScriptRunWhenSwitchedMap[indexedViewName] = func;
    }
}

export default red;