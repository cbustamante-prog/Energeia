import React from 'react';
import { Link } from 'react-router-dom';
import { IonIcon } from '@ionic/react';
import { flashOutline, calendarOutline, bulbOutline, arrowForwardOutline, sunnyOutline, moonOutline } from 'ionicons/icons';

export default function LandingPage({ darkMode, onToggleTheme }) {
  return <div className="landing">
    <a className="skip-link" href="#landing-main">Skip to content</a>
    <header className="landing-nav">
      <Link className="brand" to="/" aria-label="Energeia home"><img className="brand-image" src="/energeia-logo.png" alt="" />energeia<span className="brand-dot">.</span></Link>
      <nav aria-label="Welcome navigation"><a href="#how-it-works">How it works</a><Link to="/login">Sign in</Link><button className="theme-toggle" aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`} aria-pressed={darkMode} onClick={onToggleTheme}><IonIcon aria-hidden="true" icon={darkMode ? sunnyOutline : moonOutline} /></button></nav>
    </header>
    <main id="landing-main">
      <section className="landing-hero">
        <div className="hero-copy"><span className="landing-kicker"><span /> HOME ENERGY, UNDERSTOOD</span><h1>Small habits.<br />A clearer <em>energy picture.</em></h1><p>Understand what your appliances use, put your bills in perspective, and explore a more thoughtful way to power your home.</p><div className="landing-actions"><Link className="landing-primary" to="/register">Get started <IonIcon aria-hidden="true" icon={arrowForwardOutline} /></Link><a className="landing-secondary" href="#how-it-works">Take a closer look <span aria-hidden="true">↘</span></a></div><span className="hero-note">Your appliances. Your schedule. Useful estimates.</span></div>
        <div className="energy-illustration" role="img" aria-label="Illustration of a home connecting appliance schedules, energy estimates and household plans">
          <div className="illustration-orbit orbit-a" /><div className="illustration-orbit orbit-b" />
          <div className="house-drawing"><svg viewBox="0 0 300 260" aria-hidden="true"><path d="M40 120 150 32 260 120" /><path d="M65 105v125h170V105" /><path d="M126 230v-76h48v76" /><path d="M89 128h22v29H89zm100 0h22v29h-22z" /><path className="house-leaf" d="M147 114c-25-27-4-50 26-51 6 30-6 51-26 51zm0 0 15-30" /></svg><span>A more mindful home</span></div>
          <div className="illustration-label label-schedule"><IonIcon aria-hidden="true" icon={calendarOutline} /><span>Your daily rhythm<small>Appliance schedules</small></span></div>
          <div className="illustration-label label-energy"><IonIcon aria-hidden="true" icon={flashOutline} /><span>Energy, made visible<small>Usage & bill estimates</small></span></div>
          <div className="illustration-foot"><span /> Built around the way you live</div>
        </div>
      </section>
      <section className="landing-explainer" id="how-it-works"><div className="landing-section-heading"><span className="landing-kicker">FROM GUESSWORK TO UNDERSTANDING</span><h2>Meet your home’s energy habits.</h2><p>No smart meter needed. Start with the appliances you already know.</p></div><div className="landing-features">
        {[{ icon: flashOutline, title: 'Know what adds up', text: 'Add appliance wattage, quantities and weekly schedules to estimate household consumption.' }, { icon: calendarOutline, title: 'Make sense of your bills', text: 'Set your provider’s rate, keep estimated usage history, and compare it with the actual bills you enter.' }, { icon: bulbOutline, title: 'Try a different routine', text: 'Explore rule-based energy tips and what-if plans before changing your appliance schedules.' }].map((feature, index) => <article key={feature.title}><div className="feature-top"><IonIcon aria-hidden="true" icon={feature.icon} /><span>0{index + 1}</span></div><h3>{feature.title}</h3><p>{feature.text}</p></article>)}
      </div></section>
      <section className="landing-closer"><div><span className="landing-kicker">A SIMPLE PLACE TO START</span><h2>Your next energy habit<br />starts with understanding.</h2><p>Energeia estimates consumption from the information you enter. It is not a live meter or an official electricity bill.</p></div><Link className="landing-primary" to="/register">Create your account <IonIcon aria-hidden="true" icon={arrowForwardOutline} /></Link></section>
    </main>
    <footer className="landing-footer"><Link className="brand" to="/">energeia<span className="brand-dot">.</span></Link><span>Energy, made visible.</span><Link to="/login">Sign in to your home <span aria-hidden="true">↗</span></Link></footer>
  </div>;
}
