import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react'
import '../styles/pricing.css'

const plans = [
  { name: 'Free', price: 0, credits: 2, tagline: 'Explore the studio', features: ['2 short preview credits / month', 'Explore creation tools', 'Local downloads when available'] },
  { name: 'Creator', price: 9, credits: 30, tagline: 'For new creators', features: ['30 generation credits / month', 'Instrumental and audio tools', 'Generated file library'] },
  { name: 'Pro Music', price: 19, credits: 90, tagline: 'For active musicians', features: ['90 generation credits / month', 'All supported studio tools', 'Higher monthly allowance'] },
]

export default function PricingPage() {
  return <section className="mm-pricing">
    <div className="mm-pricing-hero">
      <span className="mm-pricing-eyebrow"><Sparkles size={16}/> MIXMASTER AI · BUSINESS PREVIEW</span>
      <h2>Plans built for every creator</h2>
      <p>Explore proposed subscription tiers and credit allowances. This is a pricing preview: checkout, billing, accounts and credit enforcement are not enabled.</p>
    </div>
    <div className="mm-pricing-grid">
      {plans.map(plan => <article className={'mm-pricing-card' + (plan.name === 'Pro Music' ? ' mm-pricing-featured' : '')} key={plan.name}>
        {plan.name === 'Pro Music' && <span className="mm-pricing-tag">POPULAR CONCEPT</span>}
        <h3>{plan.name}</h3><p>{plan.tagline}</p>
        <div className="mm-pricing-price"><strong>${plan.price}</strong><span>/ month</span></div>
        <div className="mm-pricing-credits">{plan.credits} proposed credits per month</div>
        <ul>{plan.features.map(feature => <li key={feature}><Check size={16}/>{feature}</li>)}</ul>
        <button type="button" disabled aria-label={plan.name + ' plan not yet available'}>Coming soon</button>
      </article>)}
    </div>
    <div className="mm-pricing-notes">
      <div><CreditCard size={20}/><div><strong>No payments are collected</strong><p>Plans and prices are illustrative. Payment processing will be connected only after secure account and billing infrastructure is ready.</p></div></div>
      <div><ShieldCheck size={20}/><div><strong>Usage limits are not active</strong><p>Credit costs per generation, entitlement checks, refunds and model licensing must be finalized before selling subscriptions.</p></div></div>
    </div>
  </section>
}
