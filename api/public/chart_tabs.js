(function () {
    // Define tabs
    const tabs = [
        { name: 'Line Charts', path: '/allcharts' },
        { name: 'Daily P&L', path: '/candle' },
        { name: 'Bubble', path: '/bubble.html' },
        { name: 'Brick', path: '/brick.html' },
        { name: 'Stack', path: '/stack.html' },
        { name: 'Legacy Chart', path: '/chart.html' }
    ];

    const currentPath = window.location.pathname;

    let navHtml = `
    <ul class="nav nav-pills mb-4 justify-content-center">
    `;

    tabs.forEach(tab => {
        const isActive = (tab.path === '/allcharts' && (currentPath === '/allcharts' || currentPath.endsWith('AllCharts.html'))) ||
            (tab.path === '/candle' && (currentPath === '/candle' || currentPath.endsWith('CandleChart.html'))) ||
            (currentPath === tab.path);

        navHtml += `
        <li class="nav-item">
            <a class="nav-link ${isActive ? 'active' : ''}" href="${tab.path}">${tab.name}</a>
        </li>
        `;
    });

    navHtml += `</ul>`;

    // Find a good place to insert.
    // Usually after the global nav (injected by nav.js) and before the main content title.
    // nav.js injects at 'afterbegin' of body.
    // We can inject this after the navbar if it exists, or just append to a specific container if we can identify it.
    // A safe bet is to look for `.container` and prepend it there, or inserting after the global nav.

    function injectTabs() {
        // Create a wrapper for the tabs to ensure centering and spacing
        const wrapper = document.createElement('div');
        wrapper.className = 'container d-flex justify-content-center my-3';
        wrapper.innerHTML = navHtml;

        // Ensure we inject AFTER the navbar (which is first child of body)
        // But BEFORE the main container
        const nav = document.querySelector('nav.navbar');
        const mainContainer = document.querySelector('.container.my-4') || document.querySelector('.container');

        if (nav && nav.nextSibling) {
            nav.parentNode.insertBefore(wrapper, nav.nextSibling);
        } else if (mainContainer) {
            // If nav not found, put before main container
            mainContainer.parentNode.insertBefore(wrapper, mainContainer);
        } else {
            // Fallback
            document.body.insertAdjacentElement('afterbegin', wrapper);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectTabs);
    } else {
        injectTabs();
    }

})();
