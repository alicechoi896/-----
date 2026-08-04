export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "member";

export type SourceType =
  | "url"
  | "text"
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "performance";

export type DataSourceStatus =
  | "pending"
  | "extracting"
  | "chunking"
  | "embedding"
  | "analyzing"
  | "completed"
  | "failed";

export type EntityType =
  | "company"
  | "product"
  | "audience"
  | "customer_problem"
  | "desire"
  | "objection"
  | "solution"
  | "expertise"
  | "philosophy"
  | "content_pattern"
  | "brand_expression"
  | "prohibited_expression"
  | "platform_rule";

export type CampaignGoal =
  | "awareness"
  | "views"
  | "saves"
  | "inquiries"
  | "consultations"
  | "purchases";

export type CampaignStatus = "draft" | "active" | "completed" | "archived";

export type StrategyRunStatus = "pending" | "running" | "completed" | "failed";

export type ContentProjectStatus = "draft" | "generating" | "ready" | "archived";

export type Platform =
  | "naver_blog"
  | "instagram"
  | "threads"
  | "youtube_shorts"
  | "newsletter"
  | "landing_page";

export type ContentOutputStatus = "draft" | "generated" | "edited" | "final";

export type LearningEventType =
  | "strategy_selected"
  | "strategy_rejected"
  | "content_edited"
  | "performance_registered"
  | "preference_updated"
  | "knowledge_edited";

export type ProcessingJobStatus = "pending" | "running" | "completed" | "failed";

interface Table<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      organizations: Table<
        {
          id: string;
          name: string;
          industry: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          industry?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          name?: string;
          industry?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      organization_members: Table<
        {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrgRole;
          created_at?: string;
        }
      >;
      data_sources: Table<
        {
          id: string;
          organization_id: string;
          source_type: SourceType;
          title: string;
          source_url: string | null;
          storage_path: string | null;
          original_text: string | null;
          extracted_text: string | null;
          status: DataSourceStatus;
          processing_progress: number;
          error_message: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          source_type: SourceType;
          title: string;
          source_url?: string | null;
          storage_path?: string | null;
          original_text?: string | null;
          extracted_text?: string | null;
          status?: DataSourceStatus;
          processing_progress?: number;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          source_type?: SourceType;
          title?: string;
          source_url?: string | null;
          storage_path?: string | null;
          original_text?: string | null;
          extracted_text?: string | null;
          status?: DataSourceStatus;
          processing_progress?: number;
          error_message?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      document_chunks: Table<
        {
          id: string;
          organization_id: string;
          data_source_id: string;
          chunk_index: number;
          content: string;
          token_count: number;
          embedding: number[] | null;
          embedding_model: string | null;
          embedding_dimension: number | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          data_source_id: string;
          chunk_index: number;
          content: string;
          token_count?: number;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedding_dimension?: number | null;
          metadata?: Json;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          data_source_id?: string;
          chunk_index?: number;
          content?: string;
          token_count?: number;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedding_dimension?: number | null;
          metadata?: Json;
          created_at?: string;
        }
      >;
      knowledge_entities: Table<
        {
          id: string;
          organization_id: string;
          entity_type: EntityType;
          name: string;
          summary: string | null;
          confidence_score: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          entity_type: EntityType;
          name: string;
          summary?: string | null;
          confidence_score?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          entity_type?: EntityType;
          name?: string;
          summary?: string | null;
          confidence_score?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      knowledge_evidence: Table<
        {
          id: string;
          organization_id: string;
          entity_id: string;
          data_source_id: string | null;
          chunk_id: string | null;
          evidence_text: string;
          relevance_score: number;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          entity_id: string;
          data_source_id?: string | null;
          chunk_id?: string | null;
          evidence_text: string;
          relevance_score?: number;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          entity_id?: string;
          data_source_id?: string | null;
          chunk_id?: string | null;
          evidence_text?: string;
          relevance_score?: number;
          created_at?: string;
        }
      >;
      knowledge_relations: Table<
        {
          id: string;
          organization_id: string;
          source_entity_id: string;
          target_entity_id: string;
          relation_type: string;
          description: string | null;
          confidence_score: number;
          evidence: Json;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          source_entity_id: string;
          target_entity_id: string;
          relation_type: string;
          description?: string | null;
          confidence_score?: number;
          evidence?: Json;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          source_entity_id?: string;
          target_entity_id?: string;
          relation_type?: string;
          description?: string | null;
          confidence_score?: number;
          evidence?: Json;
          created_at?: string;
        }
      >;
      decision_rules: Table<
        {
          id: string;
          organization_id: string;
          rule_name: string;
          condition_text: string;
          action_text: string;
          reason_text: string;
          rule_category: string;
          weight: number;
          confidence_score: number;
          evidence: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          rule_name: string;
          condition_text: string;
          action_text: string;
          reason_text: string;
          rule_category?: string;
          weight?: number;
          confidence_score?: number;
          evidence?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          rule_name?: string;
          condition_text?: string;
          action_text?: string;
          reason_text?: string;
          rule_category?: string;
          weight?: number;
          confidence_score?: number;
          evidence?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      brand_profiles: Table<
        {
          id: string;
          organization_id: string;
          core_message: string | null;
          tone: Json;
          preferred_expressions: Json;
          prohibited_expressions: Json;
          target_audiences: Json;
          persuasion_structure: Json;
          expertise_areas: Json;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          core_message?: string | null;
          tone?: Json;
          preferred_expressions?: Json;
          prohibited_expressions?: Json;
          target_audiences?: Json;
          persuasion_structure?: Json;
          expertise_areas?: Json;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          core_message?: string | null;
          tone?: Json;
          preferred_expressions?: Json;
          prohibited_expressions?: Json;
          target_audiences?: Json;
          persuasion_structure?: Json;
          expertise_areas?: Json;
          updated_at?: string;
        }
      >;
      campaigns: Table<
        {
          id: string;
          organization_id: string;
          name: string;
          product_entity_id: string | null;
          goal: CampaignGoal;
          audience: string | null;
          platforms: Json;
          period_start: string | null;
          period_end: string | null;
          status: CampaignStatus;
          current_problem: string | null;
          extra_conditions: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          product_entity_id?: string | null;
          goal: CampaignGoal;
          audience?: string | null;
          platforms?: Json;
          period_start?: string | null;
          period_end?: string | null;
          status?: CampaignStatus;
          current_problem?: string | null;
          extra_conditions?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          name?: string;
          product_entity_id?: string | null;
          goal?: CampaignGoal;
          audience?: string | null;
          platforms?: Json;
          period_start?: string | null;
          period_end?: string | null;
          status?: CampaignStatus;
          current_problem?: string | null;
          extra_conditions?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      strategy_runs: Table<
        {
          id: string;
          organization_id: string;
          campaign_id: string;
          input_data: Json;
          retrieved_chunk_ids: Json;
          model_name: string | null;
          status: StrategyRunStatus;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          campaign_id: string;
          input_data?: Json;
          retrieved_chunk_ids?: Json;
          model_name?: string | null;
          status?: StrategyRunStatus;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          campaign_id?: string;
          input_data?: Json;
          retrieved_chunk_ids?: Json;
          model_name?: string | null;
          status?: StrategyRunStatus;
          created_at?: string;
        }
      >;
      strategy_options: Table<
        {
          id: string;
          organization_id: string;
          strategy_run_id: string;
          strategy_type: string;
          title: string;
          summary: string;
          target_problem: string | null;
          core_message: string | null;
          content_direction: string | null;
          funnel_step: string | null;
          feature_scores: Json;
          base_score: number;
          preference_score: number;
          evidence_score: number;
          final_score: number;
          reasoning: string | null;
          evidence: Json;
          selected: boolean;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          strategy_run_id: string;
          strategy_type: string;
          title: string;
          summary: string;
          target_problem?: string | null;
          core_message?: string | null;
          content_direction?: string | null;
          funnel_step?: string | null;
          feature_scores?: Json;
          base_score?: number;
          preference_score?: number;
          evidence_score?: number;
          final_score?: number;
          reasoning?: string | null;
          evidence?: Json;
          selected?: boolean;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          strategy_run_id?: string;
          strategy_type?: string;
          title?: string;
          summary?: string;
          target_problem?: string | null;
          core_message?: string | null;
          content_direction?: string | null;
          funnel_step?: string | null;
          feature_scores?: Json;
          base_score?: number;
          preference_score?: number;
          evidence_score?: number;
          final_score?: number;
          reasoning?: string | null;
          evidence?: Json;
          selected?: boolean;
          created_at?: string;
        }
      >;
      content_projects: Table<
        {
          id: string;
          organization_id: string;
          campaign_id: string | null;
          strategy_option_id: string | null;
          title: string;
          core_message: string | null;
          target_audience: string | null;
          objective: string | null;
          status: ContentProjectStatus;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          campaign_id?: string | null;
          strategy_option_id?: string | null;
          title: string;
          core_message?: string | null;
          target_audience?: string | null;
          objective?: string | null;
          status?: ContentProjectStatus;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          campaign_id?: string | null;
          strategy_option_id?: string | null;
          title?: string;
          core_message?: string | null;
          target_audience?: string | null;
          objective?: string | null;
          status?: ContentProjectStatus;
          created_at?: string;
          updated_at?: string;
        }
      >;
      content_outputs: Table<
        {
          id: string;
          organization_id: string;
          content_project_id: string;
          platform: Platform;
          title: string | null;
          body: string | null;
          hashtags: Json;
          seo_keywords: Json;
          hook: string | null;
          call_to_action: string | null;
          generation_metadata: Json;
          status: ContentOutputStatus;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          content_project_id: string;
          platform: Platform;
          title?: string | null;
          body?: string | null;
          hashtags?: Json;
          seo_keywords?: Json;
          hook?: string | null;
          call_to_action?: string | null;
          generation_metadata?: Json;
          status?: ContentOutputStatus;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          content_project_id?: string;
          platform?: Platform;
          title?: string | null;
          body?: string | null;
          hashtags?: Json;
          seo_keywords?: Json;
          hook?: string | null;
          call_to_action?: string | null;
          generation_metadata?: Json;
          status?: ContentOutputStatus;
          created_at?: string;
          updated_at?: string;
        }
      >;
      performance_records: Table<
        {
          id: string;
          organization_id: string;
          content_output_id: string;
          impressions: number;
          views: number;
          likes: number;
          comments: number;
          saves: number;
          clicks: number;
          inquiries: number;
          consultations: number;
          purchases: number;
          revenue: number;
          performance_score: number | null;
          measured_at: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          content_output_id: string;
          impressions?: number;
          views?: number;
          likes?: number;
          comments?: number;
          saves?: number;
          clicks?: number;
          inquiries?: number;
          consultations?: number;
          purchases?: number;
          revenue?: number;
          performance_score?: number | null;
          measured_at?: string;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          content_output_id?: string;
          impressions?: number;
          views?: number;
          likes?: number;
          comments?: number;
          saves?: number;
          clicks?: number;
          inquiries?: number;
          consultations?: number;
          purchases?: number;
          revenue?: number;
          performance_score?: number | null;
          measured_at?: string;
          created_at?: string;
        }
      >;
      preference_weights: Table<
        {
          id: string;
          organization_id: string;
          clarity_weight: number;
          authority_weight: number;
          purchase_link_weight: number;
          brand_fit_weight: number;
          novelty_weight: number;
          empathy_weight: number;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          clarity_weight?: number;
          authority_weight?: number;
          purchase_link_weight?: number;
          brand_fit_weight?: number;
          novelty_weight?: number;
          empathy_weight?: number;
          updated_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          clarity_weight?: number;
          authority_weight?: number;
          purchase_link_weight?: number;
          brand_fit_weight?: number;
          novelty_weight?: number;
          empathy_weight?: number;
          updated_at?: string;
        }
      >;
      learning_events: Table<
        {
          id: string;
          organization_id: string;
          event_type: LearningEventType;
          target_type: string;
          target_id: string | null;
          before_state: Json | null;
          after_state: Json | null;
          description: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          event_type: LearningEventType;
          target_type: string;
          target_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          description?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          event_type?: LearningEventType;
          target_type?: string;
          target_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          description?: string | null;
          created_at?: string;
        }
      >;
      processing_jobs: Table<
        {
          id: string;
          organization_id: string;
          job_type: string;
          target_id: string | null;
          status: ProcessingJobStatus;
          progress: number;
          current_step: string | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          job_type: string;
          target_id?: string | null;
          status?: ProcessingJobStatus;
          progress?: number;
          current_step?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          job_type?: string;
          target_id?: string | null;
          status?: ProcessingJobStatus;
          progress?: number;
          current_step?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        }
      >;
      audit_logs: Table<
        {
          id: string;
          organization_id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        },
        {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: {
          org_name: string;
          org_industry?: string | null;
          org_description?: string | null;
        };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      match_document_chunks: {
        Args: {
          query_embedding: number[];
          match_organization_id: string;
          match_count?: number;
          match_source_types?: string[] | null;
          match_data_source_id?: string | null;
          min_similarity?: number;
        };
        Returns: {
          id: string;
          data_source_id: string;
          chunk_index: number;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
