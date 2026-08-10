<script>
    import '../app.css';
    import { page } from '$app/stores';

    const { children } = $props();

    let isAdmin = $derived($page.url.pathname.startsWith('/admin'));
    let isLogin = $derived($page.url.pathname.endsWith('/login') || $page.url.pathname === '/');
</script>

<svelte:head>
    <title>MR FK Engine — WhatsApp SaaS</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="shell">
    <div class="bg-blur bg-blur-1"></div>
    <div class="bg-blur bg-blur-2"></div>

    {#if !isLogin}
        <header class="nav">
            <div class="nav-inner">
                <div class="brand">
                    <div class="brand-icon">
                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    </div>
                    <span class="brand-name">MR FK Engine</span>
                </div>
            </div>
        </header>
    {/if}

    <main class="main" class:centered={isLogin}>
        {@render children()}
    </main>
</div>

<style>
    :global(*, *::before, *::after) { box-sizing: border-box; }
    :global(html, body) {
        margin: 0; padding: 0;
        font-family: 'Inter', -apple-system, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        min-height: 100vh;
        -webkit-font-smoothing: antialiased;
    }
    :global(input, button, select, textarea) { font-family: inherit; }

    .shell { min-height: 100vh; display: flex; flex-direction: column; position: relative; overflow-x: hidden; }

    .bg-blur {
        position: fixed; border-radius: 50%; filter: blur(100px); opacity: 0.15; pointer-events: none; z-index: 0;
    }
    .bg-blur-1 { width: 600px; height: 600px; top: -200px; right: -100px; background: #10b981; }
    .bg-blur-2 { width: 500px; height: 500px; bottom: -150px; left: -100px; background: #0ea5e9; }

    .nav {
        position: sticky; top: 0; z-index: 50;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(16, 185, 129, 0.15);
    }
    .nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 1.5rem; height: 60px; display: flex; align-items: center; }
    .brand { display: flex; align-items: center; gap: 0.625rem; }
    .brand-icon {
        width: 32px; height: 32px;
        background: #10b981;
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        color: white;
        box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
    }
    .brand-name { font-size: 1.0625rem; font-weight: 700; color: white; letter-spacing: -0.3px; }

    .main { flex: 1; position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: center; padding: 2rem 1rem; }
    .centered { align-items: center; min-height: 100vh; }
</style>
