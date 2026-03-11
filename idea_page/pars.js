import React, { useState, useEffect, useRef } from 'react';
import { Copy, Download, BookOpen, FileText, Search, CheckCircle, AlertCircle, Play, Sparkles, X, Loader2, ShieldAlert, Wrench, UploadCloud } from 'lucide-react';

const App = () => {
  const [rawText, setRawText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [parsedData, setParsedData] = useState([]);
  const [userApiKey, setUserApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gemini-2.5-flash-preview-09-2025');
  const [uiError, setUiError] = useState('');

  // PDF Extraction State
  const [isReadingPdf, setIsReadingPdf] = useState(false);

  // AI State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [activeAiTask, setActiveAiTask] = useState('');
  const [aiTargetSection, setAiTargetSection] = useState(null);
  const [aiResult, setAiResult] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Batch AI State
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const cancelBatchRef = useRef(false);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      if (!window.pdfjsLib) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.async = true;
        document.body.appendChild(script);
        
        script.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        };
      }
    };
    loadPdfJs();
  }, []);

  // Handle PDF File Upload
  const handleFileUpload = async (e) => {
    setUiError('');
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      setUiError('Please upload a valid PDF file.');
      return;
    }

    if (!window.pdfjsLib) {
      setUiError('PDF parser is still loading. Please try again in a few seconds.');
      return;
    }

    setIsReadingPdf(true);
    setRawText(''); 

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let extractedText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        let pageText = '';
        let lastY = null;
        
        textContent.items.forEach(item => {
          const y = Math.round(item.transform[5]); 
          
          if (lastY !== null && Math.abs(lastY - y) > 5) {
            pageText += '\n';
          } else if (lastY !== null && pageText.length > 0 && !pageText.endsWith(' ') && item.str.trim().length > 0) {
            pageText += ' ';
          }
          
          pageText += item.str;
          lastY = y;
        });

        extractedText += `\n__PAGE_${i}__\n` + pageText + '\n';
      }

      setRawText(extractedText);
    } catch (error) {
      console.error('Error reading PDF:', error);
      setUiError('An error occurred while trying to read the PDF.');
    } finally {
      setIsReadingPdf(false);
      e.target.value = null; 
    }
  };

  // Gemini API Caller
  const callGemini = async (prompt, systemInstruction = null, responseSchema = null) => {
    const apiKey = userApiKey || ""; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    };

    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (responseSchema) {
      payload.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      };
    }

    let retries = 5;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  // ---------------------------------------------------------
  // BATCH PROCESSING LOGIC
  // ---------------------------------------------------------
  const handleBatchStructure = async () => {
    const unstructuredSections = parsedData.filter(s => !s.is_structured);
    
    if (unstructuredSections.length === 0) {
      alert("All sections are already structured!");
      return;
    }

    setIsBatchProcessing(true);
    cancelBatchRef.current = false;
    setBatchProgress({ current: 0, total: unstructuredSections.length });

    const schema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Cleaned section title" },
        coverage_details: { type: "ARRAY", items: { type: "STRING" }, description: "Specific items, scenarios, or parts covered by this policy." },
        exclusions: { type: "ARRAY", items: { type: "STRING" }, description: "Specific items, scenarios, or conditions explicitly NOT covered." },
        dealer_actions: { type: "ARRAY", items: { type: "STRING" }, description: "Steps the dealership must take (e.g. required documentation, inspections, forms)." }
      },
      required: ["title", "coverage_details", "exclusions", "dealer_actions"]
    };

    let processedCount = 0;

    for (const section of unstructuredSections) {
      if (cancelBatchRef.current) {
        console.log("Batch processing cancelled by user.");
        break;
      }

      processedCount++;
      setBatchProgress({ current: processedCount, total: unstructuredSections.length });

      const prompt = `Transform this raw warranty manual text into a structured JSON object. Separate what is covered, what is excluded, and what administrative actions the dealer must take.\n\nRaw Text:\n${section.raw_content}`;

      try {
        const jsonResult = await callGemini(prompt, "You are an expert data architect for automotive warranty systems.", schema);
        const cleanedData = JSON.parse(jsonResult);
        
        // Update state progressively so the UI updates while looping
        setParsedData(prev => prev.map(s => 
          s.section_id === section.section_id ? { ...s, ...cleanedData, is_structured: true } : s
        ));
      } catch (err) {
        console.error(`Failed on section ${section.section_id}:`, err);
        // Continue to the next section even if one fails
      }

      // Respect rate limits - wait 2.5 seconds between API calls
      if (processedCount < unstructuredSections.length && !cancelBatchRef.current) {
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }

    setIsBatchProcessing(false);
  };

  const stopBatchProcess = () => {
    cancelBatchRef.current = true;
  };

  // Run Individual AI Tasks
  const handleAiAction = async (section, taskType) => {
    setAiTargetSection(section);
    setActiveAiTask(taskType);
    setAiModalOpen(true);
    setIsAiLoading(true);
    setAiResult('');
    setAiError('');

    try {
      if (taskType === 'summarize') {
        const prompt = `Summarize this warranty policy in plain English. What is the core takeaway for a Service Advisor explaining this to a customer?\n\nSection: ${section.section_id} - ${section.title}\nContent: ${section.raw_content}`;
        const result = await callGemini(prompt, "You are a helpful Service Director at a Hyundai dealership training a new Service Advisor. Be clear, concise, and highlight what matters most.");
        setAiResult(result);
      } 
      else if (taskType === 'limits') {
        const prompt = `Identify any specific limits mentioned in this warranty text. Look for:\n- Time limits (Months, Years, Days)\n- Mileage limits\n- Dollar amount limits ($)\n- Claim submission deadlines\n\nIf none exist, state that clearly.\n\nSection: ${section.section_id} - ${section.title}\nContent: ${section.raw_content}`;
        const result = await callGemini(prompt, "You are a precise warranty administrator. Extract only the exact limits requested. Bullet point them.");
        setAiResult(result);
      } 
      else if (taskType === 'structure') {
        const schema = {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Cleaned section title" },
            coverage_details: { type: "ARRAY", items: { type: "STRING" }, description: "Specific items, scenarios, or parts covered by this policy." },
            exclusions: { type: "ARRAY", items: { type: "STRING" }, description: "Specific items, scenarios, or conditions explicitly NOT covered." },
            dealer_actions: { type: "ARRAY", items: { type: "STRING" }, description: "Steps the dealership must take (e.g. required documentation, inspections, forms)." }
          },
          required: ["title", "coverage_details", "exclusions", "dealer_actions"]
        };
        
        const prompt = `Transform this raw warranty manual text into a structured JSON object. Separate what is covered, what is excluded, and what administrative actions the dealer must take.\n\nRaw Text:\n${section.raw_content}`;
        
        const jsonResult = await callGemini(prompt, "You are an expert data architect for automotive warranty systems.", schema);
        const cleanedData = JSON.parse(jsonResult);
        
        setParsedData(prev => prev.map(s => 
          s.section_id === section.section_id ? { ...s, ...cleanedData, is_structured: true } : s
        ));
        
        setAiResult("✨ **Success!** The text has been structured into Coverage, Exclusions, and Dealer Actions. The table behind this modal has been updated.");
      }
    } catch (err) {
      setAiError(err.message || "An error occurred while contacting the AI.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleConvert = () => {
    if (!rawText.trim()) {
      setParsedData([]);
      return;
    }

    let processedText = rawText;
    
    processedText = processedText.replace(/Page\s+(\d+)\s+of\s+\d+/gi, "\n__PAGE_$1__\n");
    processedText = processedText.replace(/2026 HYUNDAI WARRANTY POLICY AND PROCEDURES/gi, " ");
    processedText = processedText.replace(/Section \d+.*?Warranty/gi, " "); 
    processedText = processedText.replace(/^.*?(?:\.{4,}|\.\s\.\s\.\s\.).*?$/gm, '');

    const ignitionRegex = /1\.0\s+Sale of Hyundai Products/i;
    const matchIgnition = processedText.match(ignitionRegex);
    
    if (matchIgnition) {
      processedText = processedText.substring(matchIgnition.index);
    }

    const sectionRegex = /^[ \t]*([1-9]\d*(?:\.\d+)+)[ \t]*\r?\n?[ \t]*([A-Za-z0-9][^\n\r]{2,120})/gm;
    
    const sections = [];
    let match;
    let lastIndex = 0;
    let currentSection = null;
    let lastSeenPage = "1";

    while ((match = sectionRegex.exec(processedText)) !== null) {
      const sectionId = match[1].trim();
      let title = match[2].trim();
      
      title = title.replace(/__PAGE_\d+__/g, '').trim();

      if (currentSection) {
        let content = processedText.substring(lastIndex, match.index);
        
        const pages = new Set([lastSeenPage]);
        content = content.replace(/__PAGE_(\d+)__/g, (m, p1) => {
          pages.add(p1);
          lastSeenPage = p1;
          return " ";
        });

        currentSection.raw_content = content.replace(/\s+/g, ' ').trim();
        currentSection.source_pages = Array.from(pages).sort((a,b) => parseInt(a) - parseInt(b));
        
        if (currentSection.raw_content.length > 10) {
            sections.push(currentSection);
        }
      }

      currentSection = {
        section_id: sectionId,
        title: title,
        raw_content: "",
        coverage_details: [],
        exclusions: [],
        dealer_actions: [],
        is_structured: false
      };
      lastIndex = match.index + match[0].length;
    }

    if (currentSection) {
      let content = processedText.substring(lastIndex);
      const pages = new Set([lastSeenPage]);
      content = content.replace(/__PAGE_(\d+)__/g, (m, p1) => {
        pages.add(p1);
        return " ";
      });
      currentSection.raw_content = content.replace(/\s+/g, ' ').trim();
      currentSection.source_pages = Array.from(pages).sort((a,b) => parseInt(a) - parseInt(b));
      
      if (currentSection.raw_content.length > 10) {
        sections.push(currentSection);
      }
    }

    setParsedData(sections);
  };

  const filteredData = parsedData.filter(sec => 
    sec.section_id.includes(searchTerm) || 
    sec.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sec.raw_content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const copyToClipboard = () => {
    const json = JSON.stringify(parsedData, null, 2);
    const el = document.createElement('textarea');
    el.value = json;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  };

  const downloadJSON = () => {
    const json = JSON.stringify(parsedData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warranty_policies_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900 relative">
      <div className="max-w-[1400px] mx-auto">
        
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ShieldAlert className="text-blue-600" /> Warranty Policy Extractor
            </h1>
            <p className="text-slate-500 mt-1">Chunk warranty manuals into sections, then extract rules with AI.</p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <select 
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-700 font-medium cursor-pointer"
              >
                <option value="gemini-2.5-flash-preview-09-2025">Canvas Env Model (Default)</option>
                <option value="gemini-2.5-flash">Public API: Gemini 2.5 Flash</option>
                <option value="gemini-1.5-flash">Public API: Gemini 1.5 Flash</option>
              </select>
              <input 
                type="password" 
                placeholder="API Key (If external)"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg w-40 focus:ring-1 focus:ring-blue-500 outline-none"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                title="If running outside Canvas, paste your key and select a Public model."
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={copyToClipboard}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
              >
                <Copy size={16} /> Copy JSON
              </button>
              <button 
                onClick={downloadJSON}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium"
              >
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </header>

        {uiError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{uiError}</span>
            <button onClick={() => setUiError('')} className="ml-auto"><X size={16}/></button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="flex flex-col gap-4 lg:col-span-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[700px]">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <FileText size={14} /> Source Text Input
                </span>
                
                <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                  <UploadCloud size={14} />
                  Upload PDF
                  <input 
                    type="file" 
                    accept=".pdf" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
              </div>

              <div className="flex-1 relative">
                {isReadingPdf && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-blue-600">
                    <Loader2 className="animate-spin mb-3" size={32} />
                    <p className="font-medium text-sm">Extracting Text from PDF...</p>
                  </div>
                )}
                <textarea
                  className="w-full h-full p-4 outline-none resize-none font-mono text-sm bg-white"
                  placeholder="Paste the warranty text here, or use the Upload PDF button above..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50">
                <button 
                  onClick={handleConvert}
                  disabled={!rawText.trim() || isReadingPdf}
                  className="w-full flex justify-center items-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <Play size={18} fill="currentColor" /> Extract Sections
                </button>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 items-start">
              <BookOpen className="text-blue-500 shrink-0" size={20} />
              <p className="text-sm text-blue-700">
                <strong>How to use:</strong> Upload the Warranty PDF. Once extracted, hit "Extract Sections". Then, use the AI Structure button in the table to turn the text into clean JSON.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-4 lg:col-span-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[700px]">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex gap-2 items-center">
                  <div className="flex bg-slate-200 p-1 rounded-md mr-2">
                    <button 
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Table View
                    </button>
                    <button 
                      onClick={() => setViewMode('json')}
                      className={`px-3 py-1 text-xs font-medium rounded transition-all ${viewMode === 'json' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      JSON View
                    </button>
                  </div>
                  
                  {/* BATCH STRUCTURE BUTTON */}
                  {parsedData.length > 0 && parsedData.some(s => !s.is_structured) && (
                    <button 
                      onClick={handleBatchStructure}
                      disabled={isBatchProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded text-xs font-bold shadow-sm transition-colors"
                    >
                      <Sparkles size={14} /> Structure All
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search sections..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none w-full sm:w-48 lg:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {viewMode === 'json' ? (
                <pre className="flex-1 p-4 overflow-auto font-mono text-xs text-blue-900 bg-slate-900/5 selection:bg-blue-100">
                  {JSON.stringify(filteredData, null, 2)}
                </pre>
              ) : (
                <div className="flex-1 overflow-auto relative">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-4 py-2 font-semibold text-slate-500 w-20">Section</th>
                        <th className="px-4 py-2 font-semibold text-slate-500">Policy Details</th>
                        <th className="px-4 py-2 font-semibold text-slate-500 text-center w-64">Gemini Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredData.map((sec, idx) => (
                        <tr key={idx} className={`hover:bg-slate-50 group ${sec.is_structured ? 'bg-amber-50/30' : ''}`}>
                          <td className="px-4 py-3 font-bold text-blue-600 align-top whitespace-nowrap">
                            {sec.section_id}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-slate-800 flex items-center gap-2">
                              {sec.title}
                              {sec.is_structured && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] rounded-sm font-bold uppercase tracking-wider">AI Structured</span>}
                            </div>
                            
                            {sec.is_structured ? (
                              <div className="mt-2 text-xs flex flex-col gap-2">
                                {sec.coverage_details.length > 0 && (
                                  <div><span className="font-semibold text-green-700">Covered:</span> <span className="text-slate-600">{sec.coverage_details.length} rules</span></div>
                                )}
                                {sec.exclusions.length > 0 && (
                                  <div><span className="font-semibold text-red-700">Excluded:</span> <span className="text-slate-600">{sec.exclusions.length} rules</span></div>
                                )}
                                {sec.dealer_actions.length > 0 && (
                                  <div><span className="font-semibold text-blue-700">Action:</span> <span className="text-slate-600">{sec.dealer_actions.length} steps</span></div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 line-clamp-3 mt-1 font-mono bg-slate-100 p-2 rounded">
                                {sec.raw_content}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap gap-1.5 justify-center">
                              <button onClick={() => handleAiAction(sec, 'summarize')} className="px-2 py-1 text-[10px] font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 rounded border border-purple-200 flex items-center gap-1 transition-colors">
                                <Sparkles size={12}/> Summarize
                              </button>
                              <button onClick={() => handleAiAction(sec, 'limits')} className="px-2 py-1 text-[10px] font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 rounded border border-rose-200 flex items-center gap-1 transition-colors">
                                <ShieldAlert size={12}/> Find Limits
                              </button>
                              <button onClick={() => handleAiAction(sec, 'structure')} title="Use AI to structure this raw text" className="px-2 py-1 text-[10px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded border border-amber-200 flex items-center gap-1 transition-colors">
                                <Wrench size={12}/> AI Structure
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredData.length === 0 && (
                        <tr>
                          <td colSpan="3" className="px-4 py-12 text-center text-slate-400 italic">
                            No sections found. Convert text to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-[10px] text-slate-400 uppercase font-bold tracking-widest shrink-0">
                <span>Sections Found: {parsedData.length}</span>
                <span className="flex items-center gap-1">
                  <CheckCircle size={10} className="text-green-500" /> Parsed & Ready
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Batch Processing Modal */}
      {isBatchProcessing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center text-center animate-in zoom-in-95">
            <Loader2 className="animate-spin text-amber-500 mb-4" size={48} />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Structuring All Sections</h2>
            <p className="text-sm text-slate-500 mb-6">
              Processing section {batchProgress.current} of {batchProgress.total}.<br/>
              <em>Adding a short delay between each to prevent API limits.</em>
            </p>
            
            <div className="w-full bg-slate-100 rounded-full h-3 mb-6 overflow-hidden">
              <div 
                className="bg-amber-500 h-3 rounded-full transition-all duration-300" 
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              ></div>
            </div>

            <button 
              onClick={stopBatchProcess}
              className="px-6 py-2 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg font-medium transition-colors"
            >
              Cancel Processing
            </button>
          </div>
        </div>
      )}

      {/* Single AI Modal Overlay */}
      {aiModalOpen && !isBatchProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Sparkles className="text-amber-500" size={20} /> 
                {activeAiTask === 'summarize' && 'Policy Summary'}
                {activeAiTask === 'limits' && 'Warranty Limits Found'}
                {activeAiTask === 'structure' && 'AI Structural Clean Up'}
                <span className="ml-2 px-2 py-0.5 bg-white border border-slate-200 text-slate-500 rounded text-xs font-mono">
                  {aiTargetSection?.section_id}
                </span>
              </div>
              <button onClick={() => setAiModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {isAiLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="animate-spin mb-4 text-blue-500" size={32} />
                  <p>Consulting Gemini LLM...</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {activeAiTask === 'structure' ? 'Extracting Coverages, Exclusions, and Actions...' : 'Analyzing policy text...'}
                  </p>
                </div>
              ) : aiError ? (
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="font-semibold text-sm mb-1">Failed to fetch AI insight</h4>
                    <p className="text-sm">{aiError}</p>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-slate-700 prose-p:leading-relaxed prose-headings:text-slate-800">
                  {aiResult.split('\n').map((line, i) => {
                    const isBullet = line.trim().startsWith('*') || line.trim().startsWith('-');
                    let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    
                    if (isBullet) {
                      return <li key={i} className="ml-4 mb-2" dangerouslySetInnerHTML={{__html: formattedLine.substring(1)}} />;
                    }
                    if (line.trim() === '') return <br key={i} />;
                    return <p key={i} dangerouslySetInnerHTML={{__html: formattedLine}} />;
                  })}
                </div>
              )}
            </div>
            
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setAiModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
