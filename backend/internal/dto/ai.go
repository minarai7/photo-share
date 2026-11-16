package dto

type GearLinkRequest struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	// Language of the summary and reasons, and of the pages preferred:
	// "en" (default) or "ja".
	Language string `json:"language,omitempty"`
}

type GearLinkSuggestion struct {
	Title      string `json:"title"`
	URL        string `json:"url"`
	Reason     string `json:"reason"`
	Confidence string `json:"confidence"`
}

type GearLinkResponse struct {
	Kind        string               `json:"kind"`
	Name        string               `json:"name"`
	Summary     string               `json:"summary"`
	Suggestions []GearLinkSuggestion `json:"suggestions"`
}
