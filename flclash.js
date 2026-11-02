// 本机同步时提供 FLCLASH_DEVICE，GitHub 只保存节点合并和分流逻辑。
const main = (config) => {
  if (typeof FLCLASH_DEVICE === "undefined") {
    throw new Error("缺少本机连接信息，请使用本机同步地址加载脚本。");
  }
  const device = FLCLASH_DEVICE;
  const providerName = "extra-airport-b";
  const subscription = {
    type: "http",
    url: device.subscriptionUrl,
    interval: 86400,
    override: { "additional-prefix": "[B] " }
  };
  const personalNode = {
    name: device.nodeName,
    type: "vless",
    server: device.server,
    port: device.port,
    uuid: device.uuid,
    network: "tcp",
    udp: true,
    tls: true,
    servername: device.servername,
    flow: "xtls-rprx-vision",
    "client-fingerprint": "chrome",
    "reality-opts": {
      "public-key": device.publicKey
    }
  };

  const groups = config["proxy-groups"];
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("没有找到策略组，请将脚本绑定到机场 A 的完整 Clash 配置。");
  }

  // 让 B 节点和 A 的「自动选择」组使用相同的测速地址和间隔。
  const autoGroup = groups.find(group => group.type === "url-test" && group.url);
  if (autoGroup) {
    subscription["health-check"] = {
      enable: true,
      url: autoGroup.url,
      interval: autoGroup.interval || 600
    };
  }

  config["proxy-providers"] = config["proxy-providers"] || {};
  config["proxy-providers"][providerName] = subscription;
  config.proxies = config.proxies || [];
  if (!config.proxies.some(node => node.name === personalNode.name)) {
    config.proxies.push(personalNode);
  }

  // 追加到原有成员之后，各手选组可独立选择 B 的具体节点。
  for (const group of groups) {
    group.proxies = group.proxies || [];
    if (!group.proxies.includes(personalNode.name)) group.proxies.push(personalNode.name);
    group.use = group.use || [];
    if (!group.use.includes(providerName)) group.use.push(providerName);
  }

  if (!groups.some(group => group.name === "ChatGPT")) {
    throw new Error("订阅中找不到 ChatGPT 策略组，请核对魔戒的策略组名称。");
  }
  const claudeMatches = [
    "PROCESS-NAME,claude.exe",
    "IP-ASN,399358",
    "IP-CIDR6,2607:6bc0::/32",
    "IP-CIDR,160.79.104.0/21",
    "DOMAIN-SUFFIX,claudeusercontent.com",
    "DOMAIN-SUFFIX,clau.de",
    "DOMAIN-SUFFIX,claude.com",
    "DOMAIN-SUFFIX,claude.ai",
    "DOMAIN-SUFFIX,anthropic.com"
  ];
  const claudeRules = [];
  for (const match of claudeMatches) {
    const option = match.startsWith("IP-") ? ",no-resolve" : "";
    // 内核会跳过不支持 UDP 的出站，让同一条件的下一条规则拒绝该 UDP 连接。
    claudeRules.push(`${match},ChatGPT${option}`);
    claudeRules.push(`AND,((NETWORK,udp),(${match}${option})),REJECT`);
  }
  const existingRules = config.rules || [];
  config.rules = claudeRules.concat(existingRules.filter(rule => !claudeRules.includes(rule)));
  return config;
};
