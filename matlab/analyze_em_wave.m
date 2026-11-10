%% Field Notes / EM wave lab - MATLAB R2020b or later, no toolbox required.
% Choose the original measurements.csv exported by the website.
% Keep the CSV in UTF-8. All log units remain as measured.
% Text beginning = + - @ is prefixed with an apostrophe for spreadsheet safety.
clear; clc;
[file, folder] = uigetfile('*.csv', 'Select measurements.csv');
if isequal(file, 0), return; end
opts = detectImportOptions(fullfile(folder, file), 'Encoding', 'UTF-8');
required = ["group_id","group_name","level","unit","frequency_mhz", ...
    "measurement_date","environment","pair_id","instrument","location","floor","material"];
assert(all(ismember(required, string(opts.VariableNames))), ...
    'Choose the original measurements CSV, not group_summary.csv.');
textCols = ["group_id","group_name","unit","measurement_date","environment", ...
    "pair_id","instrument","location","position","material"];
opts = setvartype(opts, cellstr(textCols), 'string');
opts = setvartype(opts, {'level','frequency_mhz','floor'}, 'double');
T = readtable(fullfile(folder, file), opts);
assert(~isempty(T) && isnumeric(T.level) && all(isfinite(T.level)), 'No valid level data.');
for col = textCols
    T.(col) = string(T.(col));
    T.(col)(ismissing(T.(col))) = "";
end
ids = unique(T.group_id, 'stable');
n = numel(ids);
S = table('Size',[n 15], ...
    'VariableTypes',{'string','string','string','string','string','double','string', ...
    'string','double','string','double','double','double','double','double'}, ...
    'VariableNames',{'group_id','group_name','measurement_date','location','environment', ...
    'frequency_mhz','unit','material','floor','pair_id','count','mean_level','std_level','min_level','max_level'});
for k = 1:n
    R = T(T.group_id == ids(k), :);
    % A single group must have consistent frequency, unit and environment.
    for key = ["frequency_mhz","unit","environment","pair_id","instrument","measurement_date"]
        assert(numel(unique(R.(key))) == 1, 'Inconsistent metadata in a measurement group.');
    end
    x = R.level; mu = mean(x);
    sigma = NaN;
    if numel(x)>1, sigma=std(x,0); end % sample standard deviation, n-1
    S(k,:) = {ids(k),R.group_name(1),string(R.measurement_date(1)),R.location(1), ...
        R.environment(1),R.frequency_mhz(1),R.unit(1),R.material(1),R.floor(1), ...
        R.pair_id(1),numel(x),mu,sigma,min(x),max(x)};
    figure('Name',char(R.group_name(1)),'Color','w');
    tiledlayout(1,2);
    nexttile; histogram(x,'Normalization','pdf'); grid on; hold on;
    if isfinite(sigma) && sigma>0
        xx=linspace(min(x)-sigma,max(x)+sigma,200);
        plot(xx,exp(-0.5*((xx-mu)/sigma).^2)/(sigma*sqrt(2*pi)), ...
            'LineWidth',1.5,'DisplayName','Fitted normal');
    end
    xlabel("Level ("+R.unit(1)+")",'Interpreter','none'); ylabel('PDF');
    title(R.group_name(1),'Interpreter','none');
    nexttile;
    if isfinite(sigma) && sigma>0
        z=sort((x-mu)/sigma);
        stairs([z(1);z],[0;(1:numel(z))'/numel(z)],'LineWidth',1.5); hold on;
        zz=linspace(min(z)-1,max(z)+1,200);
        plot(zz,0.5*(1+erf(zz/sqrt(2))),'LineWidth',1.5);
        legend('Empirical CDF','Standard normal CDF','Location','best');
        xlabel('(level - mean) / sample std');
    else
        sx=sort(x);
        stairs([sx(1);sx],[0;(1:numel(sx))'/numel(sx)],'LineWidth',1.5);
        xlabel("Level ("+R.unit(1)+")",'Interpreter','none');
        title('Standardization unavailable: n < 2 or std = 0');
    end
    ylabel('CDF'); grid on;
end
disp(S);
writetable(S,fullfile(folder,'matlab_summary.csv'),'Encoding','UTF-8');
% Penetration: pooled outdoor sample mean minus each indoor group mean.
% Same pair ID, measurement date, frequency, unit and instrument only.
P=table('Size',[0 9], ...
    'VariableTypes',{'string','string','double','string','double','double','double','double','double'}, ...
    'VariableNames',{'pair_id','indoor_group','frequency_mhz','unit', ...
    'outdoor_count','indoor_count','outdoor_mean','indoor_mean','loss_db'});
for k=1:n
    R=T(T.group_id==ids(k),:);
    if R.environment(1)~="indoor" || strlength(R.pair_id(1))==0, continue; end
    match=T.environment=="outdoor" & T.pair_id==R.pair_id(1) & ...
        T.frequency_mhz==R.frequency_mhz(1) & T.unit==R.unit(1) & ...
        T.instrument==R.instrument(1) & string(T.measurement_date)==string(R.measurement_date(1));
    outside=T.level(match);
    if isempty(outside), continue; end
    P(end+1,:)={R.pair_id(1),R.group_name(1),R.frequency_mhz(1),R.unit(1), ...
        numel(outside),height(R),mean(outside),mean(R.level),mean(outside)-mean(R.level)}; %#ok<SAGROW>
end
disp(P);
writetable(P,fullfile(folder,'matlab_penetration.csv'),'Encoding','UTF-8');
fprintf('Saved group statistics and penetration tables in: %s\n',folder);
% Negative losses are retained for checking, not clipped.
% Log-level arithmetic means follow the lab handout; no linear-power averaging.

