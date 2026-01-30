const Settings = {
    getUserId: () => localStorage.getItem('trade_user_id') || '',
    setUserId: (id) => {
        localStorage.setItem('trade_user_id', id);
        // Dispatch event for other listeners
        window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { userId: id } }));
    },

    getPositionSize: () => localStorage.getItem('trade_position_size') || '20',
    setPositionSize: (size) => {
        localStorage.setItem('trade_position_size', size);
        window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { positionSize: size } }));
    },

    // Auto-fill inputs with class 'auto-user-id' or 'auto-pos-size'
    autoFill: () => {
        const id = Settings.getUserId();
        const size = Settings.getPositionSize();

        if (id) {
            document.querySelectorAll('input.auto-user-id').forEach(input => {
                input.value = id;
            });
        }
        if (size) {
            document.querySelectorAll('input.auto-pos-size').forEach(input => {
                input.value = size;
            });
        }
    }
};

// Auto-fill on load
document.addEventListener('DOMContentLoaded', Settings.autoFill);
window.addEventListener('settingsChanged', Settings.autoFill);
