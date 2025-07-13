import { Router } from 'express';
import Stripe from 'stripe';
import { prisma } from '@/config/database';
import { authenticateToken, AuthRequest } from '@/middleware/auth';
import { asyncHandler, createApiError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16'
});

// All routes require authentication
router.use(authenticateToken);

// Get current subscription
router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId: req.user!.id }
  });

  if (!subscription) {
    throw createApiError('Subscription not found', 404);
  }

  res.json({
    success: true,
    data: { subscription }
  });
}));

// Get available plans
router.get('/plans', asyncHandler(async (req, res) => {
  const plans = [
    {
      id: 'FREE',
      name: 'Free',
      description: 'Perfect for trying out our AI chat',
      price: 0,
      currency: 'USD',
      interval: 'month',
      features: [
        '50 AI messages per month',
        'Basic chat rooms',
        'Standard support'
      ],
      monthlyMessageLimit: 50,
      stripePriceId: null
    },
    {
      id: 'BASIC',
      name: 'Basic',
      description: 'Great for regular users',
      price: 9.99,
      currency: 'USD',
      interval: 'month',
      features: [
        '500 AI messages per month',
        'Unlimited chat rooms',
        'Priority support',
        'Message history export'
      ],
      monthlyMessageLimit: 500,
      stripePriceId: 'price_basic_monthly' // Replace with actual Stripe price ID
    },
    {
      id: 'PREMIUM',
      name: 'Premium',
      description: 'For power users and teams',
      price: 19.99,
      currency: 'USD',
      interval: 'month',
      features: [
        '2000 AI messages per month',
        'Unlimited chat rooms',
        'Advanced AI models',
        'Priority support',
        'Custom AI prompts',
        'Analytics dashboard'
      ],
      monthlyMessageLimit: 2000,
      stripePriceId: 'price_premium_monthly' // Replace with actual Stripe price ID
    },
    {
      id: 'ENTERPRISE',
      name: 'Enterprise',
      description: 'For large organizations',
      price: 49.99,
      currency: 'USD',
      interval: 'month',
      features: [
        'Unlimited AI messages',
        'Unlimited chat rooms',
        'All AI models',
        '24/7 priority support',
        'Custom integrations',
        'Advanced analytics',
        'Team management',
        'SSO integration'
      ],
      monthlyMessageLimit: 999999,
      stripePriceId: 'price_enterprise_monthly' // Replace with actual Stripe price ID
    }
  ];

  res.json({
    success: true,
    data: { plans }
  });
}));

// Create Stripe checkout session
router.post('/checkout', asyncHandler(async (req: AuthRequest, res) => {
  const { planId, successUrl, cancelUrl } = req.body;

  if (!planId || !successUrl || !cancelUrl) {
    throw createApiError('planId, successUrl, and cancelUrl are required', 400);
  }

  const validPlans = ['BASIC', 'PREMIUM', 'ENTERPRISE'];
  if (!validPlans.includes(planId)) {
    throw createApiError('Invalid plan ID', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { subscription: true }
  });

  if (!user) {
    throw createApiError('User not found', 404);
  }

  // Map plan IDs to Stripe price IDs
  const stripePriceIds: Record<string, string> = {
    'BASIC': 'price_basic_monthly',
    'PREMIUM': 'price_premium_monthly', 
    'ENTERPRISE': 'price_enterprise_monthly'
  };

  try {
    let customerId = user.subscription?.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id
        }
      });
      customerId = customer.id;

      // Update user's subscription with customer ID
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { stripeCustomerId: customerId }
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceIds[planId],
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: user.id,
        planId
      }
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionUrl: session.url
      }
    });

  } catch (error) {
    logger.error('Stripe checkout session creation failed:', error);
    throw createApiError('Failed to create checkout session', 500);
  }
}));

// Handle Stripe webhooks
router.post('/webhook', asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    throw createApiError('Missing Stripe signature or webhook secret', 400);
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    throw createApiError('Webhook signature verification failed', 400);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    default:
      logger.info(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}));

// Cancel subscription
router.delete('/cancel', asyncHandler(async (req: AuthRequest, res) => {
  const subscription = await prisma.subscription.findUnique({
    where: { userId: req.user!.id }
  });

  if (!subscription || !subscription.stripeSubscriptionId) {
    throw createApiError('No active subscription found', 404);
  }

  try {
    // Cancel the subscription in Stripe
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Update local subscription status
    await prisma.subscription.update({
      where: { userId: req.user!.id },
      data: { status: 'CANCELLED' }
    });

    logger.info('Subscription cancelled:', { userId: req.user!.id });

    res.json({
      success: true,
      message: 'Subscription cancelled successfully. It will remain active until the end of the current billing period.'
    });

  } catch (error) {
    logger.error('Subscription cancellation failed:', error);
    throw createApiError('Failed to cancel subscription', 500);
  }
}));

// Helper functions for webhook handling
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId || !planId) {
    logger.error('Missing metadata in checkout session:', session.id);
    return;
  }

  const planLimits: Record<string, number> = {
    'BASIC': 500,
    'PREMIUM': 2000,
    'ENTERPRISE': 999999
  };

  await prisma.subscription.update({
    where: { userId },
    data: {
      plan: planId as any,
      status: 'ACTIVE',
      stripeSubscriptionId: session.subscription as string,
      monthlyMessageLimit: planLimits[planId],
      messagesUsed: 0,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
  });

  logger.info('Subscription activated:', { userId, planId, sessionId: session.id });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  
  const subscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId }
  });

  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        messagesUsed: 0, // Reset monthly usage
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000)
      }
    });

    logger.info('Payment succeeded, subscription renewed:', { subscriptionId: subscription.id });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  
  const subscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId }
  });

  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' }
    });

    logger.warn('Payment failed, subscription marked as past due:', { subscriptionId: subscription.id });
  }
}

async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  const subscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubscription.id }
  });

  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: 'FREE',
        status: 'INACTIVE',
        stripeSubscriptionId: null,
        monthlyMessageLimit: 50,
        messagesUsed: 0
      }
    });

    logger.info('Subscription deleted, downgraded to free plan:', { subscriptionId: subscription.id });
  }
}

export default router;