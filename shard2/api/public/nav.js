(function () {
    const pages = [
        { name: 'Dashboard', path: '/' },
        { name: 'Charts', path: '/allcharts' },
        { name: 'Strategies', path: '/admin' }, // mapped to sub.html in server
        { name: 'Board', path: '/board.html' }
    ];

    const currentPath = window.location.pathname;

    // Navbar HTML
    const navHtml = `
    <nav class="navbar navbar-expand-lg navbar-dark mb-4">
        <div class="container">
            <a class="navbar-brand" href="/">
                <i class="bi bi-graph-up-arrow me-2 text-primary"></i>TradeServer
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav me-auto">
                    ${pages.map(p => `
                        <li class="nav-item">
                            <a class="nav-link ${p.path === currentPath || (p.path === '/' && currentPath === '/index.html') ? 'active' : ''}" 
                               href="${p.path}">${p.name}</a>
                        </li>
                    `).join('')}
                </ul>
                <div class="d-flex align-items-center">
                    <button class="btn btn-outline-secondary btn-sm" data-bs-toggle="modal" data-bs-target="#settingsModal">
                        <i class="bi bi-gear-fill me-1"></i> Settings
                    </button>
                </div>
            </div>
        </div>
    </nav>

    <!-- Settings Modal -->
    <div class="modal fade" id="settingsModal" tabindex="-1">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Settings</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">User ID (Board / Subscription)</label>
                        <input type="number" id="globalUserId" class="form-control" placeholder="Enter User ID (e.g., 0)">
                        <div class="form-text text-muted">This ID allows you to view your specific board trades and manage subscriptions.</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Default Position Size ($)</label>
                        <input type="number" id="globalPosSize" class="form-control" placeholder="e.g. 20">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" id="saveSettingsBtn">Save Changes</button>
                </div>
            </div>
        </div>
    </div>
    `;

    // Inject Nav
    document.body.insertAdjacentHTML('afterbegin', navHtml);

    // Settings Logic
    const initSettings = () => {
        const input = document.getElementById('globalUserId');
        const posInput = document.getElementById('globalPosSize');
        const saveBtn = document.getElementById('saveSettingsBtn');

        if (input && typeof Settings !== 'undefined') {
            input.value = Settings.getUserId();
            if (posInput) posInput.value = Settings.getPositionSize();

            saveBtn.addEventListener('click', () => {
                Settings.setUserId(input.value);
                if (posInput) Settings.setPositionSize(posInput.value);
                const modalEl = document.getElementById('settingsModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                modal.hide();
                // Optional: reload to apply changes if needed (e.g. board page)
                if (window.location.pathname.includes('board.html')) {
                    window.location.reload();
                }
            });
        }
    };

    // Wait for DOM to be ready for event listeners
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettings);
    } else {
        initSettings();
    }
})();
