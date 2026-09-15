import { Router } from "express";
import { 
  registerCapabilityPackInRegistry, 
  getCapabilitiesSince, 
  validateCapabilityPackPayload 
} from "../../../services/marketplaceService";
import { 
  registerCapabilityToolInAgent, 
  createTraceableXApiStatement, 
  getTraceableStatements, 
  recordTraceableStatement, 
  executeSourceScoutSearch, 
  ActorType, 
  OntologyVerb 
} from "../../../services/agentService";

const router = Router();

// --- CAPABILITY MARKETPLACE ROUTES ---

router.post("/marketplace/capabilities", (req, res) => {
  try {
    const payload = req.body;
    const author = (req.headers["x-local-lab-author"] as string) || payload.author || "Local Lab Researcher";

    const validation = validateCapabilityPackPayload(payload);
    if (!validation.valid) {
      return res.status(400).json({
        status: "error",
        schema: "scholar-explorer-marketplace-catalog@0.1.0",
        message: "Capability Pack payload validation failed",
        errors: validation.errors
      });
    }

    const registeredPack = registerCapabilityPackInRegistry(payload, author);
    registerCapabilityToolInAgent(registeredPack);

    res.status(201).json({
      status: "success",
      schema: "scholar-explorer-marketplace-catalog@0.1.0",
      message: `Capability Pack "${registeredPack.manifest.name}" successfully registered in central marketplace.`,
      registered_at: registeredPack.published_at,
      pack: registeredPack
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.get("/marketplace/capabilities", (req, res) => {
  try {
    const { since } = req.query;
    const packs = getCapabilitiesSince(since as string);

    res.json({
      schema: "scholar-explorer-marketplace-catalog@0.1.0",
      generated_at: new Date().toISOString(),
      source: "Scholar Explorer Central Marketplace",
      count: packs.length,
      packs
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- TRACEABILITY & XAPI PARITY ENDPOINTS ---

router.get(["/xapi/statements", "/traceability/statements"], (req, res) => {
  try {
    const { actorType } = req.query;
    const statements = getTraceableStatements(actorType as ActorType);

    res.json({
      profile: "/xapi/research_traceability_profile.json",
      ontology: "/ontologies/agent_traceability.owl",
      generated_at: new Date().toISOString(),
      count: statements.length,
      statements
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.post(["/xapi/statements", "/traceability/statements"], (req, res) => {
  try {
    const { actorType, actorId, verb, objectId, meta } = req.body;
    
    if (!verb || !objectId) {
      return res.status(400).json({ status: "error", message: "Missing required fields: verb and objectId" });
    }

    const statement = createTraceableXApiStatement({
      actorType: (actorType as ActorType) || "HumanResearcher",
      actorId,
      verb: (verb as OntologyVerb) || "executed",
      objectId,
      meta
    });

    res.status(201).json({
      status: "success",
      message: "xAPI statement recorded successfully",
      statement
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- SOURCE SCOUT MULTI-SOURCE SEARCH & ACTIONS ---

router.post("/scout/search", async (req, res) => {
  try {
    const { query, actorType, actorId } = req.body;

    if (!query) {
      return res.status(400).json({ status: "error", message: "Query string is required." });
    }

    const resolvedActorType: ActorType = actorType || (req.headers["x-actor-type"] as ActorType) || "SourceScoutAgent";
    const result = await executeSourceScoutSearch(query, resolvedActorType, actorId);

    res.json({
      status: "success",
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.post("/scout/extract", (req, res) => {
  try {
    const { paperId, paperTitle, actorType, actorId } = req.body;
    const resolvedActorType: ActorType = actorType || "SourceScoutAgent";
    const objectId = paperId ? `urn:scholar:paper:${paperId}` : `urn:scholar:paper:extraction`;

    const statement = createTraceableXApiStatement({
      actorType: resolvedActorType,
      actorId,
      verb: "extracted",
      objectId,
      meta: { paperTitle, extraction_timestamp: new Date().toISOString() }
    });

    res.json({ status: "success", message: "Paper extracted", statement });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.post("/scout/classify", (req, res) => {
  try {
    const { paperId, topic, actorType, actorId } = req.body;
    const resolvedActorType: ActorType = actorType || "SourceScoutAgent";
    const objectId = paperId ? `urn:scholar:paper:${paperId}` : `urn:scholar:classification`;

    const statement = createTraceableXApiStatement({
      actorType: resolvedActorType,
      actorId,
      verb: "classified",
      objectId,
      meta: { topic, classification_timestamp: new Date().toISOString() }
    });

    res.json({ status: "success", message: "Paper classified", statement });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.post("/scout/verify", (req, res) => {
  try {
    const { claim, doi, actorType, actorId } = req.body;
    const resolvedActorType: ActorType = actorType || "SourceScoutAgent";
    const objectId = doi ? `urn:scholar:doi:${doi}` : `urn:scholar:verification`;

    const statement = createTraceableXApiStatement({
      actorType: resolvedActorType,
      actorId,
      verb: "verified",
      objectId,
      meta: { claim, verification_timestamp: new Date().toISOString() }
    });

    res.json({ status: "success", message: "Claim verified", statement });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;

