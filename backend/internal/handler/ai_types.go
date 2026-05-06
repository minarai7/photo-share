package handler

type gearLinkRequest struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
}

type gearLinkSuggestion struct {
	Title      string `json:"title"`
	URL        string `json:"url"`
	Reason     string `json:"reason"`
	Confidence string `json:"confidence"`
}

type gearLinkResponse struct {
	Kind        string               `json:"kind"`
	Name        string               `json:"name"`
	Summary     string               `json:"summary"`
	Suggestions []gearLinkSuggestion `json:"suggestions"`
}
