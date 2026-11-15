import { useState } from 'react'
import { ArrowRight, Check, CreditCard, Crown, ShieldCheck, Sparkles } from 'lucide-react'
import '../styles/pricing.css'

const plans = [
  { name: 'Free', price: 0, credits: 2, tagline: 'For exploring the studio', features: ['2 proposed preview credits monthly', 'Try available studio tools', 'Download supported generated audio'] },
  { name: 'Creator', price: 9, credits: 30, tagline: 'For everyday creators', features: ['30 proposed generation credits monthly', 'AI music and audio tools', 'Saved music library', 'Download supported formats'] },
  { name: 'Pro Music', price: 19, credits: 90, tagline: 'For passionate music makers', features: ['90 proposed generation credits monthly', 'All supported studio tools', 'Larger monthly allowance', 'Premium-tier preview'] },
]

export default function PricingPage() {
  const [annual,setAnnual] = useState(false)
  return <section className="mm-pricing mm-price-screen">
    <header className="mm-price-title"><span className="mm-price-icon"><Crown size={25}/></span><div><span className="mm-pricing-eyebrow"><Sparkles size={14}/> SUBSCRIPTION PREVIEW</span><h2>Upgrade your creative studio</h2><p>Three simple plans for making more music. These prices and credits are illustrative, not active subscriptions.</p></div></header>
    <div className="mm-billing-picker" role="group" aria-label="Billing period preview">
      <button type="button" className={!annual?'active':''} aria-pressed={!annual} onClick={()=>setAnnual(false)}>Monthly</button>
      <button type="button" className={annual?'active':''} aria-pressed={annual} onClick={()=>setAnnual(true)}>Annual <span>Preview 20% off</span></button>
    </div>
    <div className="mm-pricing-grid">
      {plans.map(plan => <article className={'mm-pricing-card'+(plan.name==='Pro Music'?' mm-pricing-featured':'')} key={plan.name}>
        {plan.name==='Pro Music'&&<span className="mm-pricing-tag"><Crown size={14}/> PRO PLAN</span>}
        <h3>{plan.name}</h3>
        <p>{plan.tagline}</p>
        <div className="mm-pricing-price"><strong>${plan.price===0?'0':(annual?plan.price*.8:plan.price).toFixed(annual?2:0)}</strong><span>/ month</span></div>
        <p className="mm-pricing-billed">{annual?'Illustrative price billed annually':'Illustrative monthly price'}</p>
        <div className="mm-pricing-credits">{plan.credits} proposed credits / month</div>
        <ul>{plan.features.map(feature=><li key={feature}><Check size={16}/>{feature}</li>)}</ul>
        <button type="button" disabled>{plan.price===0?'Free preview':'Coming soon'}</button>
      </article>)}
    </div>
    <p className="mm-pricing-disclaimer">Billing is not enabled · Credits and plan entitlements are not enforced · No payment will be collected here.</p>
    <div className="mm-pricing-notes">
      <div><CreditCard size={20}/><div><strong>Plans are a preview</strong><p>Secure accounts, checkout, payment webhooks, and credit tracking must be completed before selling subscriptions.</p></div></div>
      <div><ShieldCheck size={20}/><div><strong>Create now with the tools available</strong><p>Current local generation tools are accessible independently of these planned subscription tiers.</p><a href="#/full-song">Go to Music Generator <ArrowRight size={14}/></a></div></div>
    </div>
  </section>
}
