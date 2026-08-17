<script>
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let successMessage = $state('');
	let isPendingApproval = $state(false);
	let loading = $state(false);

	const API_URL = '/api';

	async function handleSignup() {
		error = '';
		successMessage = '';
		isPendingApproval = false;

		if (!email.trim() || !password) {
			error = 'Please fill in all required fields.';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;
		try {
			const res = await fetch(`${API_URL}/auth/signup`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: email.trim(),
					password
				})
			});

			let data;
			try {
				data = await res.json();
			} catch {
				data = {};
			}

			if (res.ok) {
				if (data.status === 'pending_approval') {
					isPendingApproval = true;
					successMessage =
						data.message ||
						'Registration submitted! Multiple accounts were detected on your IP. Your account is pending administrator approval.';
				} else {
					// Auto-login active accounts
					localStorage.setItem('userToken', data.token);
					localStorage.setItem('userEmail', data.email);
					if (data.userId) localStorage.setItem('userId', data.userId);
					goto('/dashboard');
				}
			} else {
				error = data.error || 'Failed to create account.';
			}
		} catch {
			error = 'Network error. Cannot reach server.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="card">
	<div class="card-glow"></div>
	<div class="brand">
		<div class="icon">🚀</div>
		<h1>Create Account</h1>
		<p>Register your client console to connect WhatsApp.</p>
	</div>

	{#if error}
		<div class="alert alert-err">
			<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/></svg
			>
			<span>{error}</span>
		</div>
	{/if}

	{#if isPendingApproval}
		<div class="alert alert-warning">
			<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/></svg
			>
			<div>
				<strong>Approval Required</strong>
				<p style="margin: 0.35rem 0 0; font-size: 0.8125rem; line-height: 1.4;">
					Multiple accounts were detected on your network or device. Your registration has been sent
					to the admin for review.
				</p>
			</div>
		</div>
		<button type="button" class="btn-primary" onclick={() => goto('/login')}>
			Return to Login
		</button>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSignup();
			}}
		>
			<div class="field">
				<label for="email">Email Address</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					disabled={loading}
					placeholder="you@example.com"
					autocomplete="email"
				/>
			</div>
			<div class="field">
				<label for="password">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					required
					disabled={loading}
					placeholder="Min. 6 characters"
					autocomplete="new-password"
				/>
			</div>
			<div class="field">
				<label for="confirmPassword">Confirm Password</label>
				<input
					id="confirmPassword"
					type="password"
					bind:value={confirmPassword}
					required
					disabled={loading}
					placeholder="Repeat password"
					autocomplete="new-password"
				/>
			</div>
			<button type="submit" class="btn-primary" disabled={loading}>
				{#if loading}<span class="spin"></span> Creating Account...{:else}Sign Up & Connect WhatsApp{/if}
			</button>
		</form>

		<div class="footer-links">
			<span>Already have an account?</span>
			<a href="/login" class="link">Log in</a>
		</div>
	{/if}
</div>

<style>
	.card {
		width: 100%;
		max-width: 420px;
		background: rgba(30, 41, 59, 0.8);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(100, 116, 139, 0.3);
		border-radius: 20px;
		padding: 2.5rem;
		position: relative;
		overflow: hidden;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
	}
	.card-glow {
		position: absolute;
		bottom: -60px;
		right: -60px;
		width: 180px;
		height: 180px;
		background: radial-gradient(circle, rgba(20, 184, 166, 0.2), transparent 70%);
		border-radius: 50%;
		pointer-events: none;
	}
	.brand {
		text-align: center;
		margin-bottom: 1.75rem;
		position: relative;
		z-index: 1;
	}
	.icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
		display: block;
	}
	.brand h1 {
		font-size: 1.625rem;
		font-weight: 700;
		color: #fff;
		margin: 0 0 0.25rem;
	}
	.brand p {
		font-size: 0.875rem;
		color: #94a3b8;
		margin: 0;
	}

	.alert {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
		border-radius: 10px;
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
		position: relative;
		z-index: 1;
	}
	.alert-err {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #f87171;
	}
	.alert-warning {
		background: rgba(245, 158, 11, 0.12);
		border: 1px solid rgba(245, 158, 11, 0.35);
		color: #fbbf24;
	}

	form {
		position: relative;
		z-index: 1;
	}
	.field {
		margin-bottom: 1.125rem;
	}
	.field label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #94a3b8;
		margin-bottom: 0.4rem;
	}
	.field input {
		width: 100%;
		padding: 0.75rem 1rem;
		background: rgba(15, 23, 42, 0.6);
		border: 1px solid rgba(100, 116, 139, 0.4);
		border-radius: 10px;
		color: #e2e8f0;
		font-size: 0.9375rem;
		outline: none;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
		box-sizing: border-box;
	}
	.field input:focus {
		border-color: #14b8a6;
		box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
	}
	.field input:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.field input::placeholder {
		color: #475569;
	}

	.btn-primary {
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.875rem;
		background: #0d9488;
		color: white;
		border: none;
		border-radius: 10px;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		box-shadow: 0 4px 15px rgba(13, 148, 136, 0.3);
	}
	.btn-primary:hover:not(:disabled) {
		background: #0f766e;
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(13, 148, 136, 0.4);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.footer-links {
		margin-top: 1.5rem;
		text-align: center;
		font-size: 0.875rem;
		color: #94a3b8;
		display: flex;
		justify-content: center;
		gap: 0.4rem;
		position: relative;
		z-index: 1;
	}
	.link {
		color: #14b8a6;
		text-decoration: none;
		font-weight: 600;
		transition: color 0.2s;
	}
	.link:hover {
		color: #2dd4bf;
		text-decoration: underline;
	}

	.spin {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
