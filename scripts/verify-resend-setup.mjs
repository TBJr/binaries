#!/usr/bin/env node
/**
 * Verify Resend Configuration Guide
 * 
 * This script helps diagnose common issues with Resend email delivery.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const parentDir = dirname(__dirname);

// Load environment variables
function loadEnv() {
  const envPath = join(parentDir, '.env');
  if (!readFileSync(envPath).includes('RESEND_API_KEY=')) {
    console.log('⚠️  RESEND_API_KEY not found in .env - check that you have set it');
  }
  
  const envContent = readFileSync(envPath, 'utf-8');
  
  const resendApiKeyMatch = envContent.match(/RESEND_API_KEY="([^"]*)"/);
  const resendFromEmailMatch = envContent.match(/RESEND_FROM_EMAIL="([^"]*)"/);
  
  return {
    apiKey: resendApiKeyMatch ? resendApiKeyMatch[1] : null,
    fromEmail: resendFromEmailMatch ? resendFromEmailMatch[1] : null,
  };
}

// Check Resend domain verification requirements
async function checkResendSetup() {
  const config = loadEnv();
  
  console.log('='.repeat(60));
  console.log('RESEND EMAIL DELIVERY SETUP VERIFICATION');
  console.log('='.repeat(60));
  console.log();
  
  // Check if Resend is selected as the delivery method
  const authEmailDelivery = (() => {
    try {
      return process.env.AUTH_EMAIL_DELIVERY || 'undefined';
    } catch (e) {
      return undefined;
    }
  })();
  
  console.log('1. AUTH_EMAIL_DELIVERY:', authEmailDelivery);
  if (authEmailDelivery !== 'resend') {
    console.log('   ⚠️  Make sure to set AUTH_EMAIL_DELIVERY=resend');
  } else {
    console.log('   ✓ Resend is selected as the outbound mail provider');
  }
  console.log();
  
  // Check API key configuration
  console.log('2. RESEND_API_KEY:');
  if (config.apiKey) {
    console.log(`   ${'•'.repeat(30)}`);
    const maskedKey = config.apiKey.slice(0, 10) + '...' + 
                       config.apiKey.slice(-10);
    console.log(`   Key: ${maskedKey}`);
    console.log(`   ${'•'.repeat(30)}`);
    console.log('   ✓ API key is configured');
    
    // Check if it looks like a valid Resend key (starts with re_)
    if (!config.apiKey.startsWith('re_')) {
      console.log('   ⚠️  WARNING: Resend API keys should start with "re_"');
    } else {
      console.log('   ✓ Key format is correct (starts with "re_")');
    }
  } else {
    console.log('   ❌ RESEND_API_KEY is NOT configured');
    console.log('   → Go to your Resend dashboard and generate an API key');
    console.log('   → Copy the full-access key (not send-only)');
  }
  console.log();
  
  // Check From email configuration
  console.log('3. RESEND_FROM_EMAIL:');
  if (config.fromEmail) {
    console.log(`   ${'•'.repeat(30)}`);
    console.log(`   Email: ${config.fromEmail}`);
    console.log(`   ${'•'.repeat(30)}`);
    console.log('   ✓ From email is configured');
    
    // Extract domain from the email
    const atIndex = config.fromEmail.lastIndexOf('@');
    if ( atIndex !== -1 ) {
      const domain = config.fromEmail.substring(atIndex + 1);
      console.log(`   Domain: ${domain}`);
      
      console.log('   ⚠️  IMPORTANT: This domain MUST be verified in Resend!');
      console.log('   → Go to https://resend.com/domains and add/verify your domain');
      console.log('   → Publish the SPF/DKIM records provided by Resend');
    }
  } else {
    console.log('   ❌ RESEND_FROM_EMAIL is NOT configured');
    console.log('   → Set this to a verified sender address on your Resend subdomain');
  }
  console.log();
  
  // Common issues checklist
  console.log('='.repeat(60));
  console.log('COMMON ISSUES CHECKLIST:');
  console.log('='.repeat(60));
  console.log();
  
  const issues = [];
  
  if (!config.apiKey) {
    issues.push({
      issue: 'Missing API Key',
      fix: 'Generate a full-access API key in Resend dashboard'
    });
  }
  
  if (!config.fromEmail) {
    issues.push({
      issue: 'Missing From Email',
      fix: 'Configure RESEND_FROM_EMAIL with a verified sender address'
    });
  }
  
  const fromDomain = config.fromEmail ? 
    config.fromEmail.substring(config.fromEmail.lastIndexOf('@') + 1) : null;
  if (fromDomain) {
    issues.push({
      issue: `Unverified domain (${fromDomain})`,
      fix: `Add and verify ${fromDomain} in Resend dashboard, then publish SPF/DKIM records`
    });
  }
  
  if (issues.length === 0) {
    console.log('✓ No configuration issues detected!');
    console.log();
    console.log('Next steps to test your setup:');
    console.log('1. Ensure DNS records (SPF/DKIM) are published and propagated');
    console.log('2. Wait a few minutes for DNS propagation');
    console.log('3. Test by sending an email via /api/mail/test-send');
    console.log('4. Check Resend dashboard → Domains → [your domain] → Status');
    return;
  }
  
  issues.forEach(({ issue, fix }) => {
    console.log(`❌ ${issue}`);
    console.log(`   Fix: ${fix}`);
    console.log();
  });
  
  console.log('='.repeat(60));
  console.log('RESEND DASHBOARD LINKS:');
  console.log('='.repeat(60));
  console.log('• Dashboard: https://resend.com/dashboard');
  console.log('• Domains: https://resend.com/domains');
  console.log('• API Keys: https://resend.com/api-keys');
  console.log();
}

checkResendSetup().catch(console.error);