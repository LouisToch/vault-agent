const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g. eyrwiy-tb.myshopify.com

// Helper to call Shopify API
async function shopifyFetch(endpoint) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/${endpoint}`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

// Helper to call Claude API
async function claudeAsk(systemPrompt, userMessage) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  const data = await res.json();
  return data.content[0].text;
}

// GET /dashboard - returns full daily briefing
app.get('/dashboard', async (req, res) => {
  try {
    const [ordersData, productsData, customersData] = await Promise.all([
      shopifyFetch('orders.json?status=any&limit=50&created_at_min=' + new Date(Date.now() - 86400000).toISOString()),
      shopifyFetch('products.json?limit=50'),
      shopifyFetch('customers.json?limit=50&created_at_min=' + new Date(Date.now() - 86400000).toISOString())
    ]);

    const orders = ordersData.orders || [];
    const products = productsData.products || [];
    const newCustomers = customersData.customers || [];

    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

    // Get pending orders needing fulfillment
    const unfulfilled = orders.filter(o => o.fulfillment_status !== 'fulfilled');

    // Get customer emails needing reply (simplified - orders with notes)
    const ordersWithNotes = orders.filter(o => o.note && o.note.length > 0);

    const summary = {
      revenue: totalRevenue.toFixed(2),
      orders: totalOrders,
      avgOrderValue,
      newCustomers: newCustomers.length,
      unfulfilledOrders: unfulfilled.length,
      totalProducts: products.length,
      ordersWithNotes: ordersWithNotes.length,
      topProducts: products.slice(0, 5).map(p => ({
        title: p.title,
        status: p.status,
        variants: p.variants.length
      }))
    };

    // Ask Claude for insights
    const insight = await claudeAsk(
      `You are VAULT AI, the operations agent for VAULT Timepieces, a minimalist luxury watch dropshipping brand in Belgium targeting the EU market. 
       Be concise, direct, and actionable. Talk like a smart business advisor, not a chatbot.`,
      `Here is today's store data for VAULT Timepieces:
       - Revenue last 24h: €${summary.revenue}
       - Orders: ${summary.orders}
       - Average order value: €${summary.avgOrderValue}
       - New customers: ${summary.newCustomers}
       - Unfulfilled orders: ${summary.unfulfilledOrders}
       - Total products: ${summary.totalProducts}
       - Orders with customer notes: ${summary.ordersWithNotes}
       
       Give a sharp 3-4 sentence daily briefing. What happened, what needs attention, and one actionable recommendation.`
    );

    res.json({ summary, insight, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /ask - ask the AI agent anything
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    const [ordersData, productsData] = await Promise.all([
      shopifyFetch('orders.json?status=any&limit=50&created_at_min=' + new Date(Date.now() - 86400000).toISOString()),
      shopifyFetch('products.json?limit=50')
    ]);

    const orders = ordersData.orders || [];
    const products = productsData.products || [];
    const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

    const context = `Store data: ${orders.length} orders today, €${totalRevenue.toFixed(2)} revenue, ${products.length} products.`;

    const answer = await claudeAsk(
      `You are VAULT AI, the operations agent for VAULT Timepieces, a minimalist luxury watch dropshipping brand in Belgium. 
       Be concise, sharp, and actionable. You have access to live store data.`,
      `${context}\n\nUser question: ${question}`
    );

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products - list all products with basic stats
app.get('/products', async (req, res) => {
  try {
    const data = await shopifyFetch('products.json?limit=50');
    const products = (data.products || []).map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      price: p.variants[0]?.price,
      inventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
      image: p.images[0]?.src
    }));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /orders - recent orders
app.get('/orders', async (req, res) => {
  try {
    const data = await shopifyFetch('orders.json?status=any&limit=20');
    const orders = (data.orders || []).map(o => ({
      id: o.id,
      name: o.name,
      total: o.total_price,
      status: o.fulfillment_status || 'unfulfilled',
      customer: o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Guest',
      createdAt: o.created_at
    }));
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VAULT Agent running on port ${PORT}`));
