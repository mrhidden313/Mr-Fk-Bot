<script>
    import '../app.css';
</script>

<svelte:head>
    <title>MR FK - Premium WhatsApp SaaS</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="min-h-screen bg-[#0f172a] text-slate-100 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
    <!-- Premium Glassmorphism Navbar -->
    <header class="sticky top-0 z-50 backdrop-blur-lg bg-[#1e293b]/70 border-b border-slate-700/50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-16">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <span class="font-bold text-xl tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">MR FK Engine</span>
                </div>
            </div>
        </div>
    </header>

    <main class="flex-grow flex items-center justify-center p-4">
        <slot />
    </main>
</div>
