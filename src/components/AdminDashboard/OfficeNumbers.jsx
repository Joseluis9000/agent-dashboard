import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import StatCard from './StatCard'; // Make sure this path is correct

// ---------- Region Table ----------
const RegionTable = ({ region, offices, totals, formatCurrency }) => (
  <div className="bg-white shadow rounded-xl overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-200">
      <h2 className="text-xl font-bold text-gray-800">{region}</h2>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-700">
        <thead className="text-[11px] tracking-wide uppercase bg-gray-50">
          <tr>
            <th className="px-4 py-3 sticky left-0 bg-gray-50 z-10">Office</th>
            {['New Business', 'Endorsement', 'Installment', 'DMV', 'Renewal', 'Taxes'].map((h) => (
              <React.Fragment key={h}>
                <th className="px-4 py-3 text-right">{h} #</th>
                <th className="px-4 py-3 text-right">{h} Fees</th>
                <th className="px-4 py-3 text-right">{h} Avg</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {offices
            .slice()
            .sort((a, b) => a.office.localeCompare(b.office))
            .map((row) => (
              <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10">
                  {row.office}
                </td>

                <td className="px-4 py-3 text-right">{row.new_business_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.new_business_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.nb_avg)}
                </td>

                <td className="px-4 py-3 text-right">{row.endorsement_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.endorsement_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.endorsement_avg)}
                </td>

                <td className="px-4 py-3 text-right">{row.installment_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.installment_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.installment_avg)}
                </td>

                <td className="px-4 py-3 text-right">{row.dmv_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.dmv_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.dmv_avg)}
                </td>

                <td className="px-4 py-3 text-right">{row.renewal_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.renewal_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.renewal_avg)}
                </td>

                <td className="px-4 py-3 text-right">{row.taxes_count || 0}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.tax_fees)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatCurrency(row.tax_avg)}
                </td>
              </tr>
            ))}
        </tbody>

        <tfoot className="bg-gray-100 font-semibold">
          <tr>
            <td className="px-4 py-3 sticky left-0 bg-gray-100 z-10">TOTALS</td>
            <td className="px-4 py-3 text-right">{totals.new_business_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.new_business_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.nb_avg)}</td>

            <td className="px-4 py-3 text-right">{totals.endorsement_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.endorsement_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.endorsement_avg)}</td>

            <td className="px-4 py-3 text-right">{totals.installment_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.installment_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.installment_avg)}</td>

            <td className="px-4 py-3 text-right">{totals.dmv_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.dmv_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.dmv_avg)}</td>

            <td className="px-4 py-3 text-right">{totals.renewal_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.renewal_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.renewal_avg)}</td>

            <td className="px-4 py-3 text-right">{totals.taxes_count || 0}</td>
            <td className="px-4 py-3 text-right">{formatCurrency(totals.tax_fees)}</td>
            <td className="px-4 py-3 text-right text-blue-900">{formatCurrency(totals.tax_avg)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
);

// ---------- Main Component ----------
const OfficeNumbers = () => {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthOptions, setMonthOptions] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    const fetchSalesData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('office_numbers')
        .select('*')
        .order('month_start_date', { ascending: false });

      if (error) setError(error.message);
      else {
        setSalesData(data || []);
        if (data?.length) {
          const uniqueMonths = [...new Set(data.map((i) => i.month_start_date))];
          setMonthOptions(uniqueMonths);
          setSelectedMonth(uniqueMonths[0]);
        }
      }
      setLoading(false);
    };
    fetchSalesData();
  }, []);

  const formatMonth = (d) =>
    new Date(d).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

  const formatCurrency = (n) =>
    parseFloat(n || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });

  const filteredData = salesData.filter((i) => i.month_start_date === selectedMonth);

  const regionalData = filteredData.reduce((acc, row) => {
    const region = row.region || 'Unknown';
    (acc[region] ??= { offices: [] }).offices.push(row);
    return acc;
  }, {});

  const keys = ['new_business', 'endorsement', 'installment', 'dmv', 'renewal', 'taxes'];

  // Calculate totals for each region
  for (const region in regionalData) {
    const totals = regionalData[region].offices.reduce((t, o) => {
      keys.forEach((k) => {
        t[`${k}_count`] = (t[`${k}_count`] || 0) + (o[`${k}_count`] || 0);
        t[`${k}_fees`] = (t[`${k}_fees`] || 0) + (o[`${k}_fees`] || 0);
      });
      return t;
    }, {});
    keys.forEach((k) => {
      totals[`${k}_avg`] = totals[`${k}_count`]
        ? totals[`${k}_fees`] / totals[`${k}_count`]
        : 0;
    });
    regionalData[region].totals = totals;
  }

  // Calculate grand total for all regions
  const grandTotal = Object.values(regionalData).reduce((t, r) => {
    keys.forEach((k) => {
      t[`${k}_count`] = (t[`${k}_count`] || 0) + (r.totals[`${k}_count`] || 0);
      t[`${k}_fees`] = (t[`${k}_fees`] || 0) + (r.totals[`${k}_fees`] || 0);
    });
    return t;
  }, {});
  keys.forEach((k) => {
    grandTotal[`${k}_avg`] = grandTotal[`${k}_count`]
      ? grandTotal[`${k}_fees`] / grandTotal[`${k}_count`]
      : 0;
  });

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <h2 className="text-2xl font-semibold">Loading Office Numbers...</h2>
      </div>
    );

  if (error)
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-semibold text-red-600">Error: {error}</h2>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-800">Office Performance</h1>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full sm:w-auto bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm"
          >
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>

        {/* ===== Summary Cards ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6">
          {Object.keys(regionalData)
            .sort()
            .map((region) => (
              <StatCard
                key={region}
                title={region}
                totalBusiness={regionalData[region].totals?.new_business_count || 0}
                totalFees={formatCurrency(regionalData[region].totals?.new_business_fees)}
                avgFee={formatCurrency(regionalData[region].totals?.new_business_avg)}
              />
            ))}

          <StatCard
            title="Grand Total"
            totalBusiness={grandTotal.new_business_count || 0}
            totalFees={formatCurrency(grandTotal.new_business_fees)}
            avgFee={formatCurrency(grandTotal.new_business_avg)}
            isGrandTotal
          />
        </div>

        {/* ===== Regional Tables ===== */}
        {Object.keys(regionalData)
          .sort()
          .map((region) => (
            <RegionTable
              key={region}
              region={region}
              offices={regionalData[region].offices}
              totals={regionalData[region].totals}
              formatCurrency={formatCurrency}
            />
          ))}

        {/* ===== Grand Total Table ===== */}
        <RegionTable
          region="Grand Total (All Regions)"
          offices={[]}
          totals={grandTotal}
          formatCurrency={formatCurrency}
        />

      </div>
    </div>
  );
};

export default OfficeNumbers;
