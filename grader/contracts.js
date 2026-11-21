import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const scenarios = ['checkout', 'timeline', 'calendar', 'catalogue',
  'settlement', 'utc_edges', 'rounding', 'late_refunds'];
export const tables = ['customers', 'products', 'orders', 'order_items', 'payments', 'refunds',
  'order_status_history', 'product_price_history'];
const definitions = [
  ['01_financial_state', 15, 'order_id:int8 order_total:numeric paid_amount:numeric refunded_amount:numeric net_amount:numeric financial_status:text'],
  ['02_payment_anomalies', 10, 'order_id:int8 anomaly_type:text'],
  ['03_repeat_customers', 10, 'customer_id:int8 first_order_id:int8 second_order_id:int8 first_purchase_at:timestamptz second_purchase_at:timestamptz days_between:int4 repeated_within_30_days:bool'],
  ['04_historical_prices', 10, 'item_id:int8 unit_price:numeric historical_price:numeric price_status:text'],
  ['05_order_funnel', 15, 'order_id:int8 created_at:timestamptz paid_at:timestamptz shipped_at:timestamptz delivered_at:timestamptz to_paid:interval to_ship:interval to_deliver:interval late:bool repeat_count:int8'],
  ['06_cohort_retention', 15, 'cohort_month:date cohort_size:int8 m0_retention:numeric m1_retention:numeric m2_retention:numeric'],
  ['07_abc_analysis', 10, 'product_id:int8 revenue:numeric revenue_share:numeric cumulative_share:numeric abc_category:text'],
  ['08_optimized_query', 15, 'product_id:int8 units:int8 gross:numeric'],
];
export const oids = { int8: 20, int4: 23, numeric: 1700, text: 25, timestamptz: 1184,
  bool: 16, interval: 1186, date: 1082 };
export const tasks = definitions.map(([stem, points, result], i) => ({
  id: i + 1, file: stem + '.sql', columns: result.split(' ').map(c => c.split(':')),
  weights: i === 7 ? scenarios.map(() => 0.25)
    : points === 15 ? [2, 2, 2, 2, 2, 2, 2, 1] : [2, 2, 1, 1, 1, 1, 1, 1],
}));
export async function expectedRows(scenario, task) {
  const json = await readFile(join(root, 'tests', 'expected', scenario + '.json'), 'utf8');
  return JSON.parse(json)[task.id].map(row => row.map((v, i) =>
    task.columns[i][1] === 'interval' && v !== null ? v + ' microseconds' : v));
}
