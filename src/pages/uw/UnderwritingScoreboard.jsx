import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../supabaseClient';
import styles from '../../components/AdminDashboard/AdminDashboard.module.css';

const SCOREBOARD_REGION_LOGOS = {
  'BAY AREA': '/bay.png',
  'CEN-CAL': '/cen-cal.png',
  'KERN': '/kern-county.png',
  'SOUTHERN CALIFORNIA': '/southern-cali.png',
  'STANISLAUS': '/stanislaus.png',
  'MERCED': '/merced.png',
  'SAN DIEGO': '/san-diego.png',
};

const cleanStr = (value) => String(value ?? '').replace(/\r/g, '').trim();
const normalizeRegion = (value = '') => cleanStr(value).replace(/\s+/g, ' ').toUpperCase();
const getScoreboardRegionLogo = (regionName) => SCOREBOARD_REGION_LOGOS[normalizeRegion(regionName)] || '';
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parseMoney = (value) => { const parsed = parseFloat(String(value ?? '').replace(/[$,]/g, '').trim()); return Number.isFinite(parsed) ? parsed : 0; };
const formatCurrency = (value, digits = 2) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value)||0);
const formatNumber = (value) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);

const normalizeOffice = (value = '') => {
  const match = String(value || '').match(/CA\d{3}/i);
  return match ? match[0].toUpperCase() : cleanStr(value) || 'Unknown';
};

function parseTransactionDate(value) {
  const text = cleanStr(value);
  const match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let [, month, day, year, hour, minute, second, meridiem] = match;
  year = Number(year); if (year < 100) year += 2000;
  hour = Number(hour); if (meridiem.toUpperCase()==='PM' && hour!==12) hour += 12; if (meridiem.toUpperCase()==='AM' && hour===12) hour = 0;
  const parsed = new Date(year, Number(month)-1, Number(day), hour, Number(minute), Number(second));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseCsv(text) {
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  for (let i=0;i<text.length;i+=1) {
    const char=text[i]; const next=text[i+1];
    if (char === '"') { if (quoted && next === '"') { cell += '"'; i += 1; } else quoted = !quoted; }
    else if (char===',' && !quoted) { row.push(cell); cell=''; }
    else if ((char==='\n' || char==='\r') && !quoted) { if (char==='\r' && next==='\n') i+=1; row.push(cell); if (row.some((value)=>cleanStr(value))) rows.push(row); row=[]; cell=''; }
    else cell+=char;
  }
  if (cell.length || row.length) { row.push(cell); if (row.some((value)=>cleanStr(value))) rows.push(row); }
  return rows;
}

function buildScoreboardTransactionKey(row) {
  return [cleanStr(row.receipt_id),cleanStr(row.customer_id),Number(row.premium||0).toFixed(2),Number(row.fee||0).toFixed(2),Number(row.total||0).toFixed(2),cleanStr(row.company),cleanStr(row.type)].join('|');
}

function normalizeScoreboardCsv(csvText) {
  const parsed=parseCsv(csvText.replace(/^\uFEFF/,''));
  if (parsed.length<2) throw new Error('The Transaction Detail file does not contain any transaction rows.');
  const headers=parsed[0].map((value)=>cleanStr(value));
  const required=['Cust ID','Customer','Receipt','Date/Time','Type','Policy #','Policy Type','Company','CSR','Office','Premium','Fees','Total'];
  const missing=required.filter((name)=>!headers.includes(name));
  if (missing.length) throw new Error(`This does not look like the expected Transaction Detail export. Missing: ${missing.join(', ')}`);
  const indexOf=(name)=>headers.indexOf(name); const normalized=[]; const reportDates=new Set();
  parsed.slice(1).forEach((sourceRow)=>{
    const transactionDate=parseTransactionDate(sourceRow[indexOf('Date/Time')]); if (!transactionDate) return;
    const reportDate=localDateKey(transactionDate); reportDates.add(reportDate);
    const row={receipt_id:cleanStr(sourceRow[indexOf('Receipt')]),customer_id:cleanStr(sourceRow[indexOf('Cust ID')]),customer:cleanStr(sourceRow[indexOf('Customer')]),agent_email:null,csr:cleanStr(sourceRow[indexOf('CSR')]),office:normalizeOffice(sourceRow[indexOf('Office')]),region:null,type:cleanStr(sourceRow[indexOf('Type')]),company:cleanStr(sourceRow[indexOf('Company')]),policy:cleanStr(sourceRow[indexOf('Policy #')]),policy_type:cleanStr(sourceRow[indexOf('Policy Type')]),premium:parseMoney(sourceRow[indexOf('Premium')]),fee:parseMoney(sourceRow[indexOf('Fees')]),total:parseMoney(sourceRow[indexOf('Total')]),transaction_date_time:transactionDate.toISOString(),voided:cleanStr(sourceRow[headers.length]).toUpperCase().includes('VOID')};
    if (!row.receipt_id && !row.customer_id && !row.office) return;
    row.transaction_key=buildScoreboardTransactionKey(row);
    normalized.push(row);
  });
  if (!normalized.length) throw new Error('No usable Transaction Detail rows were found in this file.');
  if (reportDates.size!==1) throw new Error(`The scoreboard upload must contain one business date only. This file contains ${reportDates.size} dates.`);
  return {reportDate:Array.from(reportDates)[0],rows:normalized};
}

function scoreboardRankSort(a,b){
  const nbDiff=Number(b.nb||0)-Number(a.nb||0); if(nbDiff) return nbDiff;
  const feeDiff=Number(b.broker_fee||0)-Number(a.broker_fee||0); if(feeDiff) return feeDiff;
  return cleanStr(a.office||a.agent_name).localeCompare(cleanStr(b.office||b.agent_name),undefined,{numeric:true});
}

export default function UnderwritingScoreboard() {
  const { user, profile } = useAuth();
  const scoreboardFileRef = useRef(null);
  const [scoreboardModalOpen, setScoreboardModalOpen] = useState(false);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);
  const [scoreboardUploading, setScoreboardUploading] = useState(false);
  const [scoreboardError, setScoreboardError] = useState('');
  const [scoreboardScope, setScoreboardScope] = useState('company');
  const [scoreboardData, setScoreboardData] = useState({ snapshot: null, regions: [], offices: [], agents: [] });

  const loadScoreboard = useCallback(async (reportDate = localDateKey()) => {
    setScoreboardLoading(true);
    setScoreboardError('');
    try {
      const [snapshotResult, regionResult, officeResult, agentResult] = await Promise.all([
        supabase.from('scoreboard_current_snapshot').select('*').eq('report_date', reportDate).maybeSingle(),
        supabase.from('scoreboard_region_totals').select('*').eq('report_date', reportDate).order('region'),
        supabase.from('scoreboard_office_totals').select('*').eq('report_date', reportDate).order('office'),
        supabase.from('scoreboard_agent_totals').select('*').eq('report_date', reportDate),
      ]);
      const firstError=snapshotResult.error||regionResult.error||officeResult.error||agentResult.error;
      if(firstError) throw firstError;
      const next={snapshot:snapshotResult.data||null,regions:regionResult.data||[],offices:officeResult.data||[],agents:agentResult.data||[]};
      setScoreboardData(next);
      return next;
    } catch(loadError){
      console.error('[UnderwritingScoreboard] load failed:',loadError);
      setScoreboardError(loadError?.message||'Unable to load the daily scoreboard.');
      return null;
    } finally {
      setScoreboardLoading(false);
    }
  },[]);

  useEffect(()=>{ loadScoreboard(); },[loadScoreboard]);

  useEffect(() => {
    const channel = supabase
      .channel('underwriting-shared-scoreboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scoreboard_uploads' }, (payload) => {
        const reportDate = payload?.new?.report_date || payload?.old?.report_date || localDateKey();
        loadScoreboard(reportDate);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadScoreboard]);

  const handleScoreboardUpload = useCallback(async (event) => {
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file) return;
    setScoreboardUploading(true);
    setScoreboardError('');
    let uploadId=null;
    try {
      const text=await file.text();
      const normalized=normalizeScoreboardCsv(text);
      const uploadProfileName=cleanStr(profile?.full_name||user?.user_metadata?.full_name||profile?.email||user?.email)||'Underwriting';
      const {data:upload,error:uploadError}=await supabase.from('scoreboard_uploads').insert({
        report_date:normalized.reportDate,
        uploaded_by:profile?.id||user?.id||null,
        uploaded_by_name:uploadProfileName,
        uploaded_by_email:cleanStr(profile?.email||user?.email)||null,
        uploaded_by_region:cleanStr(profile?.region)||'UNDERWRITING',
        file_name:file.name,
        status:'processing'
      }).select('id').single();
      if(uploadError) throw uploadError;
      uploadId=upload.id;
      const {error:ingestError}=await supabase.rpc('ingest_scoreboard_upload',{p_upload_id:uploadId,p_report_date:normalized.reportDate,p_rows:normalized.rows});
      if(ingestError) throw ingestError;
      await loadScoreboard(normalized.reportDate);
      setScoreboardScope('company');
      setScoreboardModalOpen(true);
    } catch(uploadError){
      console.error('[UnderwritingScoreboard] upload failed:',uploadError);
      setScoreboardError(uploadError?.message||'Unable to process the Transaction Detail file.');
      if(uploadId) {
        await supabase.from('scoreboard_uploads').update({status:'failed',error_message:uploadError?.message||'Upload failed',completed_at:new Date().toISOString()}).eq('id',uploadId);
      }
    } finally {
      setScoreboardUploading(false);
    }
  },[profile,user,loadScoreboard]);

  return (
    <main className={styles.adminHome}>
      <section className={styles.homeHero}>
        <div>
          <div className={styles.homeEyebrow}>UNDERWRITING / DAILY SALES</div>
          <h1>G&amp;P Scoreboard</h1>
          <p>Upload the daily Transaction Detail file and keep the shared company scoreboard current.</p>
        </div>
      </section>

      <section className={`${styles.homeSection} ${styles.scoreboardSection}`}>
        <div className={styles.sectionTitleRow}>
          <div>
            <div className={styles.sectionKicker}>Daily Sales</div>
            <h2>Shared Company Scoreboard</h2>
            <p>This is the same live scoreboard used by Admin and Regional leadership.</p>
          </div>
          {scoreboardData.snapshot && (
            <div className={styles.scoreboardLiveBadge}><span /> LIVE SHARED BOARD</div>
          )}
        </div>

        <article className={styles.scoreboardOverviewCard}>
          {scoreboardError && <div className={styles.homeError}>{scoreboardError}</div>}
          {scoreboardLoading ? (
            <div className={styles.scoreboardEmpty}>Loading today's scoreboard…</div>
          ) : scoreboardData.snapshot ? (
            <>
              <div className={styles.scoreboardOverviewTop}>
                <div>
                  <span className={styles.scoreboardDateLabel}>TODAY'S COMPANY SCOREBOARD</span>
                  <strong className={styles.scoreboardDate}>
                    {new Date(`${scoreboardData.snapshot.report_date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                  </strong>
                </div>
                <div className={styles.scoreboardAsOf}>
                  <span>Scoreboard as of</span>
                  <strong>{new Date(scoreboardData.snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
                </div>
              </div>

              <div className={styles.scoreboardMetricGrid}>
                <div><span>New Business</span><strong>{formatNumber(scoreboardData.snapshot.company_nb)}</strong><small>NB</small></div>
                <div><span>Broker Fee</span><strong>{formatCurrency(scoreboardData.snapshot.company_broker_fee, 0)}</strong><small>Company total</small></div>
                <div><span>Average BF</span><strong>{formatCurrency(scoreboardData.snapshot.company_avg_broker_fee, 0)}</strong><small>Per new business</small></div>
              </div>

              <div className={styles.scoreboardUploadMeta}>
                <div>
                  <span>Latest update</span>
                  <strong>{scoreboardData.snapshot.uploaded_by_name || 'Manager'}</strong>
                  <small>{scoreboardData.snapshot.uploaded_by_region || 'UNDERWRITING'}</small>
                </div>
                <div className={styles.scoreboardRegionCount}>
                  <span>Regions reporting</span>
                  <strong>{scoreboardData.regions.length}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.scoreboardEmpty}>No company scoreboard has been uploaded for today yet.</div>
          )}

          <input ref={scoreboardFileRef} type="file" accept=".csv,text/csv" className={styles.hiddenScoreboardInput} onChange={handleScoreboardUpload} />
          <div className={styles.scoreboardActions}>
            <button className={styles.scoreboardUploadButton} type="button" onClick={() => scoreboardFileRef.current?.click()} disabled={scoreboardUploading}>
              {scoreboardUploading ? 'Processing…' : 'Upload Transaction Details'}
            </button>
            <button className={styles.scoreboardViewButton} type="button" onClick={() => setScoreboardModalOpen(true)} disabled={!scoreboardData.snapshot || scoreboardLoading}>
              View Full Scoreboard
            </button>
          </div>
        </article>
      </section>

      {scoreboardModalOpen && (
        <ScoreboardModal
          data={scoreboardData}
          scope={scoreboardScope}
          onScopeChange={setScoreboardScope}
          onClose={()=>setScoreboardModalOpen(false)}
          onUpload={()=>scoreboardFileRef.current?.click()}
          uploading={scoreboardUploading}
        />
      )}
    </main>
  );
}

const ScoreboardModal = ({ data, scope, onScopeChange, onClose, onUpload, uploading }) => {
  const snapshot = data.snapshot;
  const [selectedRegion, setSelectedRegion] = useState(() => cleanStr(data.regions?.[0]?.region));
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [screenshotView, setScreenshotView] = useState('offices');

  const regionNames = useMemo(
    () => [...new Set((data.regions || []).map((row) => cleanStr(row.region)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [data.regions]
  );

  useEffect(() => {
    if (scope === 'region' && (!selectedRegion || !regionNames.includes(selectedRegion))) {
      setSelectedRegion(regionNames[0] || '');
    }
  }, [scope, selectedRegion, regionNames]);

  const isRegion = scope === 'region' && Boolean(selectedRegion);
  const normalizedSelectedRegion = normalizeRegion(selectedRegion);

  const scopedOffices = useMemo(
    () => isRegion ? data.offices.filter((row) => normalizeRegion(row.region) === normalizedSelectedRegion) : data.offices,
    [data.offices, isRegion, normalizedSelectedRegion]
  );
  const scopedAgents = useMemo(
    () => isRegion ? data.agents.filter((row) => normalizeRegion(row.region) === normalizedSelectedRegion) : data.agents,
    [data.agents, isRegion, normalizedSelectedRegion]
  );
  const scopedRegions = useMemo(
    () => isRegion ? data.regions.filter((row) => normalizeRegion(row.region) === normalizedSelectedRegion) : data.regions,
    [data.regions, isRegion, normalizedSelectedRegion]
  );

  const scopedNb = scopedOffices.reduce((sum, row) => sum + Number(row.nb || 0), 0);
  const scopedBf = scopedOffices.reduce((sum, row) => sum + Number(row.broker_fee || 0), 0);
  const scopedAvg = scopedNb ? scopedBf / scopedNb : 0;
  const topOffices = [...scopedOffices].sort(scoreboardRankSort).slice(0, 5);
  const topAgents = [...scopedAgents].sort(scoreboardRankSort).slice(0, 5);

  const officesByRegion = useMemo(() => {
    const groups = new Map();
    scopedOffices.forEach((office) => {
      const name = cleanStr(office.region) || 'Unassigned';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(office);
    });
    return Array.from(groups.entries())
      .map(([name, offices]) => ({ name, offices: offices.sort((a, b) => cleanStr(a.office).localeCompare(cleanStr(b.office), undefined, { numeric: true })) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [scopedOffices]);

  const sortedScopedAgents = useMemo(() => [...scopedAgents].sort(scoreboardRankSort), [scopedAgents]);
  const screenshotAgentColumns = useMemo(() => {
    const columnCount = 3;
    const perColumn = Math.max(1, Math.ceil(sortedScopedAgents.length / columnCount));
    return Array.from({ length: columnCount }, (_, index) => sortedScopedAgents.slice(index * perColumn, (index + 1) * perColumn)).filter((rows) => rows.length);
  }, [sortedScopedAgents]);

  if (!snapshot) return null;

  const displayNb = isRegion ? scopedNb : Number(snapshot.company_nb || 0);
  const displayBf = isRegion ? scopedBf : Number(snapshot.company_broker_fee || 0);
  const displayAvg = isRegion ? scopedAvg : Number(snapshot.company_avg_broker_fee || 0);

  return (
    <div className={`${styles.modalBackdrop} ${screenshotMode ? styles.screenshotBackdrop : ''}`} role="presentation" onMouseDown={onClose}>
      <div className={`${styles.scoreboardModal} ${screenshotMode ? styles.scoreboardScreenshotMode : ''}`} role="dialog" aria-modal="true" aria-label="Daily G&P Scoreboard" onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.scoreboardModalHeader}>
          <div>
            <p className={styles.scoreboardModalEyebrow}>DAILY G&amp;P SCOREBOARD</p>
            <h2>{new Date(`${snapshot.report_date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
            <p>
              Scoreboard as of <strong>{new Date(snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
              {' · '}Last uploaded by {snapshot.uploaded_by_name || 'Manager'}
              {snapshot.uploaded_by_region ? ` · ${snapshot.uploaded_by_region}` : ''}
            </p>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onClose} aria-label="Close scoreboard">×</button>
        </div>

        <div className={styles.scoreboardToolbar}>
          <div className={styles.scoreboardScopeToggle}>
            <button type="button" className={scope === 'company' ? styles.scopeActive : ''} onClick={() => onScopeChange('company')}>Company</button>
            <button type="button" className={scope === 'region' ? styles.scopeActive : ''} onClick={() => onScopeChange('region')} disabled={!regionNames.length}>Region</button>
          </div>

          {scope === 'region' && (
            <select className={styles.scoreboardRegionSelectAdmin} value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
              {regionNames.map((name) => <option value={name} key={name}>{name}</option>)}
            </select>
          )}

          <div className={styles.scoreboardToolbarActions}>
            <button type="button" className={styles.screenshotButton} onClick={() => { setScreenshotView('offices'); setScreenshotMode(true); }}>Screenshot View</button>
            <button type="button" className={styles.modalUploadButton} onClick={onUpload} disabled={uploading}>{uploading ? 'Processing…' : 'Upload New File'}</button>
          </div>
        </div>

        {screenshotMode && (
          <div className={styles.screenshotControls} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className={screenshotView === 'offices' ? styles.screenshotControlActive : ''} onClick={() => setScreenshotView('offices')}>Office Board</button>
            <button type="button" className={screenshotView === 'agents' ? styles.screenshotControlActive : ''} onClick={() => setScreenshotView('agents')}>Agent Board</button>
            <button type="button" onClick={() => setScreenshotMode(false)}>Exit Screenshot View</button>
          </div>
        )}

        <div className={styles.scoreboardModalBody}>
          <div className={styles.scoreboardShareHeader}>
            <div>
              <strong>{isRegion ? `${selectedRegion} G&P SCOREBOARD` : 'G&P COMPANY SCOREBOARD'}</strong>
              <span>{new Date(`${snapshot.report_date}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div>
              <span>Scoreboard as of</span>
              <strong>{new Date(snapshot.scoreboard_as_of).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>
            </div>
          </div>

          {(!screenshotMode || screenshotView === 'offices') && (
            <>
              <div className={styles.scoreboardTitleBand}>
                <strong>{isRegion ? `${selectedRegion} SCOREBOARD` : 'G&P COMPANY SCOREBOARD'}</strong>
                <span>{isRegion ? 'Selected region' : 'All regions'}</span>
              </div>

              <div className={styles.scoreboardSummaryStrip}>
                <div><span>NB</span><strong>{formatNumber(displayNb)}</strong></div>
                <div><span>BF</span><strong>{formatCurrency(displayBf)}</strong></div>
                <div><span>AVG</span><strong>{formatCurrency(displayAvg)}</strong></div>
              </div>

              <div className={styles.scoreboardSheetGrid}>
                <div className={styles.scoreboardRegionsColumn}>
                  {officesByRegion.map((group) => {
                    const regionTotal = scopedRegions.find((row) => normalizeRegion(row.region) === normalizeRegion(group.name));
                    return <ScoreboardRegionBlock key={group.name} name={group.name} offices={group.offices} total={regionTotal} />;
                  })}
                </div>

                {!screenshotMode && (
                  <div className={styles.scoreboardLeadersColumn}>
                    <ScoreboardRanking title="TOP 5 OFFICES" rows={topOffices} labelKey="office" />
                    <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                  </div>
                )}
              </div>

              {screenshotMode && (
                <div className={styles.scoreboardScreenshotFooter}>
                  <section className={styles.scoreboardGrandTotal}>
                    <div className={styles.scoreboardGrandTotalTitle}>{isRegion ? `${selectedRegion} TOTAL:` : 'G&P TOTAL:'}</div>
                    <div className={styles.scoreboardGrandTotalMetrics}>
                      <div><span>NB</span><strong>{formatNumber(displayNb)}</strong></div>
                      <div><span>BF</span><strong>{formatCurrency(displayBf)}</strong></div>
                      <div><span>AVG</span><strong>{formatCurrency(displayAvg)}</strong></div>
                    </div>
                  </section>
                  <ScoreboardRanking title="TOP 5 OFFICES" rows={topOffices} labelKey="office" />
                  <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                </div>
              )}
            </>
          )}

          {(!screenshotMode || screenshotView === 'agents') && (
            <section className={`${styles.agentScoreboardSection} ${screenshotMode ? styles.agentScreenshotBoard : ''}`}>
              <div className={styles.agentScoreboardHeader}>
                <strong>{isRegion ? `${selectedRegion} AGENTS` : 'G&P AGENT SCOREBOARD'}</strong>
                <span>{scopedAgents.length} agents with activity</span>
              </div>

              {screenshotMode ? (
                <div className={styles.agentScreenshotLayout}>
                  <div className={styles.agentScreenshotColumns}>
                    {screenshotAgentColumns.map((column, columnIndex) => (
                      <div className={styles.agentScreenshotColumn} key={`agent-column-${columnIndex}`}>
                        <div className={styles.agentScreenshotHeader}><span>Agent</span><span>NB</span><span>BF</span><span>AVG</span></div>
                        {column.map((agent) => (
                          <div className={styles.agentScreenshotRow} key={`${agent.agent_key}-${agent.office}`}>
                            <strong>{agent.agent_name}</strong>
                            <span>{formatNumber(agent.nb)}</span>
                            <span>{formatCurrency(agent.broker_fee, 0)}</span>
                            <span>{formatCurrency(agent.avg_broker_fee, 0)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <ScoreboardRanking title="TOP 5 AGENTS" rows={topAgents} labelKey="agent_name" sublabelKey="office" />
                </div>
              ) : (
                <div className={styles.agentScoreboardTable}>
                  <div className={styles.scoreboardTableHeader}><span>Agent</span><span>Office</span><span>NB</span><span>BF</span><span>AVG</span></div>
                  {sortedScopedAgents.map((agent) => (
                    <div className={styles.scoreboardTableRow} key={`${agent.agent_key}-${agent.office}`}>
                      <strong>{agent.agent_name}</strong>
                      <span>{agent.office}</span>
                      <span>{formatNumber(agent.nb)}</span>
                      <span>{formatCurrency(agent.broker_fee)}</span>
                      <span>{formatCurrency(agent.avg_broker_fee)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

function ScoreboardRegionBlock({ name, offices, total }) {
  const fallbackNb = offices.reduce((sum, row) => sum + Number(row.nb || 0), 0);
  const fallbackBf = offices.reduce((sum, row) => sum + Number(row.broker_fee || 0), 0);
  const totalNb = Number(total?.nb ?? fallbackNb);
  const totalBf = Number(total?.broker_fee ?? fallbackBf);
  const totalAvg = totalNb ? totalBf / totalNb : 0;

  return (
    <section className={styles.regionScoreboardBlock}>
      <div className={styles.regionScoreboardTitle}>
        {getScoreboardRegionLogo(name) ? (
          <img className={styles.regionScoreboardLogo} src={getScoreboardRegionLogo(name)} alt={`${name} region`} />
        ) : (
          <span>{name}</span>
        )}
      </div>
      <div className={styles.scoreboardTableHeader}><span>Office</span><span>NB</span><span>BF</span><span>AVG</span></div>
      {offices.map((office) => (
        <div className={styles.scoreboardTableRow} key={office.office}>
          <strong>{office.office}</strong>
          <span>{formatNumber(office.nb)}</span>
          <span>{formatCurrency(office.broker_fee)}</span>
          <span>{formatCurrency(office.avg_broker_fee)}</span>
        </div>
      ))}
      <div className={styles.scoreboardTotalRow}>
        <strong>{name} TOTAL</strong>
        <span>{formatNumber(totalNb)}</span>
        <span>{formatCurrency(totalBf)}</span>
        <span>{formatCurrency(totalAvg)}</span>
      </div>
    </section>
  );
}

const ScoreboardRanking = ({ title, rows, labelKey, sublabelKey }) => {
  const nameHeader = labelKey === 'office' ? 'Office' : 'Agent';
  return (
    <section className={styles.scoreboardRanking}>
      <div className={styles.scoreboardRankingTitle}>{title}</div>
      <div className={styles.scoreboardRankingHeader}>
        <span>#</span><span>{nameHeader}</span><span>NB</span><span>BF</span><span>AVG</span>
      </div>
      {rows.length ? rows.map((row, index) => (
        <div className={styles.scoreboardRankingRow} key={`${row[labelKey]}-${index}`}>
          <span className={styles.scoreboardRank}>{index + 1}</span>
          <div><strong>{row[labelKey]}</strong>{sublabelKey && <small>{row[sublabelKey]}</small>}</div>
          <span>{formatNumber(row.nb)}</span>
          <span>{formatCurrency(row.broker_fee, 0)}</span>
          <span>{formatCurrency(row.avg_broker_fee, 0)}</span>
        </div>
      )) : <div className={styles.scoreboardRankingEmpty}>No activity yet.</div>}
    </section>
  );
};
