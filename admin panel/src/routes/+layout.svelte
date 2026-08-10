<script>
    import '../app.css';
    import { page } from '$app/stores';

    const { children } = $props();

    let isAdmin = $derived($page.url.pathname.startsWith('/admin'));
    let isLogin = $derived($page.url.pathname.endsWith('/login') || $page.url.pathname === '/');

</script>

<svelte:head>
    <title>MR FK Engine — WhatsApp SaaS</title>
    <meta name="description" content="MR FK Engine - Premium WhatsApp automation platform" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</svelte:head>

<div class="app-shell" class:admin-shell={isAdmin}>
    <div class="bg-canvas">
        <div class="bg-orb bg-orb-1" class:admin-orb={isAdmin}></div>
        <div class="bg-orb bg-orb-2" class:admin-orb-2={isAdmin}></div>
        <div class="bg-grid"></div>
    </div>

    {#if !isLogin}
        <nav class="nav" class:nav-admin={isAdmin}>
            <div class="nav-inner">
                <div class="nav-brand">
                    <div class="brand-dot" class:brand-dot-admin={isAdmin}></div>
                    <span>MR FK Engine</span>
                    {#if isAdmin}
                        <span class="nav-tag">ADMIN</span>
                    {:else}
                        <span class="nav-tag nav-tag-user">CLIENT</span>
                    {/if}
                </div>
            </div>
        </nav>
    {/if}

    <main class="main" class:main-fullscreen={isLogin}>
        {@render children()}
    </main>
</div>

<style>
    :global(*, *::before, *::after) { box-sizing: border-box; }
    :global(html, body) {
        margin: 0; padding: 0;
        font-family: 'Inter', -apple-system, sans-serif;
        background: #0d1117;
        color: #e2e8f0;
        min-height: 100vh;
        -webkit-font-smoothing: antialiased;
    }
    :global(input, button, select, textarea) { font-family: inherit; }
    :global(body) { overflow-x: hidden; }

    .app-shell { min-height: 100vh; position: relative; display: flex; flex-direction: column; }

    .bg-canvas { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
    .bg-orb {
        position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.4;
        animation: orb-float 8s ease-in-out infinite;
    }
    .bg-orb-1 {
        width: 500px; height: 500px; top: -150px; right: -100px;
        background: radial-gradient(circle, rgba(20,184,166,0.3), transparent 70%);
    }
    .bg-orb-2 {
        width: 400px; height: 400px; bottom: -100px; left: -100px;
        background: radial-gradient(circle, rgba(14,165,233,0.2), transparent 70%);
        animation-delay: -4s;
    }
    .admin-orb { background: radial-gradient(circle, rgba(99,102,241,0.3), transparent 70%) !important; }
    .admin-orb-2 { background: radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%) !important; }
    @keyframes orb-float {
        0%, 100% { transform: translateY(0px) scale(1); }
        50% { transform: translateY(-30px) scale(1.05); }
    }
    .bg-grid {
        position: absolute; inset: 0;
        background-image: linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px);
        background-size: 60px 60px;
    }

    .nav {
        position: sticky; top: 0; z-index: 50;
        background: rgba(13,17,23,0.8); backdrop-filter: blur(16px);
        border-bottom: 1px solid rgba(20,184,166,0.1);
    }
    .nav-admin { border-bottom-color: rgba(99,102,241,0.15); }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; height: 56px; display: flex; align-items: center; }
    .nav-brand { display: flex; align-items: center; gap: 0.625rem; font-size: 1rem; font-weight: 700; color: #f1f5f9; }
    .brand-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: #14b8a6; box-shadow: 0 0 8px rgba(20,184,166,0.6);
        animation: pulse-dot 2s ease-in-out infinite;
    }
    .brand-dot-admin { background: #6366f1; box-shadow: 0 0 8px rgba(99,102,241,0.6); }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .nav-tag {
        font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em;
        padding: 0.2rem 0.5rem; border-radius: 4px;
        background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.25);
    }
    .nav-tag-user { background: rgba(20,184,166,0.15); color: #14b8a6; border-color: rgba(20,184,166,0.25); }

    .main { position: relative; z-index: 1; flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 2rem 1rem; }
    .main-fullscreen { align-items: center; min-height: 100vh; }
</style>
